import express from 'express';
import RegionAccessRequest from '../models/RegionAccessRequest.js';
import User from '../models/User.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { sendNotificationToUser } from '../../server.js';

const router = express.Router();

// Check if user can make a request
router.get('/eligibility', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check for recent request
    const recentRequest = await RegionAccessRequest.findOne({
      userId,
      createdAt: { $gte: new Date(Date.now() - 5 * 1000) } // Last 5 seconds
    }).sort({ createdAt: -1 });
    
    if (recentRequest) {
      const secondsRemaining = Math.ceil((5 * 1000 - (Date.now() - recentRequest.createdAt)) / 1000);
      return res.json({
        canMakeRequest: false,
        message: `You can make another request in ${secondsRemaining} seconds`,
        cooldownEnds: new Date(recentRequest.createdAt.getTime() + 5 * 1000)
      });
    }
    
    res.json({
      canMakeRequest: true,
      message: 'You can make a request'
    });
  } catch (error) {
    console.error('Error checking request eligibility:', error);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// Submit region access request
router.post('/', authRequired, async (req, res) => {
  try {
    console.log('=== BACKEND REQUEST SUBMISSION ===');
    console.log('Request body:', req.body);
    console.log('User ID:', req.user.id);
    
    const { requestedCountries, requestedRegions } = req.body || {};
    const userId = req.user.id;
    
    console.log('Parsed data:', { requestedCountries, requestedRegions });
    
    if (!requestedCountries || !Array.isArray(requestedCountries) || requestedCountries.length === 0) {
      console.log('Validation failed: No countries provided');
      return res.status(400).json({ error: 'At least one country must be requested' });
    }
    
    if (requestedCountries.length > 3) {
      console.log('Validation failed: Too many countries');
      return res.status(400).json({ error: 'Maximum 3 countries allowed' });
    }
    
    // Check if user can make a request
    const recentRequest = await RegionAccessRequest.findOne({
      userId,
      createdAt: { $gte: new Date(Date.now() - 5 * 1000) }
    });
    
    console.log('Recent request check:', recentRequest ? 'Found recent request' : 'No recent request');
    
    if (recentRequest) {
      console.log('Cooldown active, denying request');
      return res.status(429).json({ error: 'You can only make one request every 5 seconds' });
    }
    
    // Create request
    console.log('Creating new request...');
    const request = await RegionAccessRequest.create({
      userId,
      requestedCountries,
      requestedRegions: requestedRegions || []
    });
    
    console.log('Request created successfully:', request._id);
    
    res.json({
      success: true,
      requestId: request._id,
      message: 'Request submitted successfully'
    });
  } catch (error) {
    console.error('Error creating region request:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// Get user's requests
router.get('/my-requests', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const requests = await RegionAccessRequest.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({ requests });
  } catch (error) {
    console.error('Error fetching user requests:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Admin: Get all pending requests
router.get('/admin/pending', adminRequired, async (req, res) => {
  try {
    const requests = await RegionAccessRequest.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .lean();
    
    // Get user details for each request
    const requestsWithUsers = await Promise.all(requests.map(async (request) => {
      const user = await User.findById(request.userId).select('name email').lean();
      return {
        ...request,
        userId: user ? { name: user.name, email: user.email } : { name: 'Unknown User', email: '' }
      };
    }));
    
    res.json({ requests: requestsWithUsers });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// Admin: Get all requests
router.get('/admin/all', adminRequired, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};
    
    const requests = await RegionAccessRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
    
    const total = await RegionAccessRequest.countDocuments(query);
    
    res.json({ 
      requests, 
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching all requests:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Admin: Approve request
router.put('/admin/:requestId/approve', adminRequired, async (req, res) => {
  try {
    console.log('=== ADMIN APPROVAL ===');
    const { requestId } = req.params;
    const { adminNotes = '' } = req.body || {};
    const adminId = req.user.id;
    
    console.log('Approving request:', requestId, 'by admin:', adminId);
    
    const request = await RegionAccessRequest.findById(requestId);
    if (!request) {
      console.log('Request not found:', requestId);
      return res.status(404).json({ error: 'Request not found' });
    }
    
    console.log('Request found:', {
      id: request._id,
      userId: request.userId,
      status: request.status,
      countries: request.requestedCountries,
      regions: request.requestedRegions
    });
    
    if (request.status !== 'pending') {
      console.log('Request already processed:', request.status);
      return res.status(400).json({ error: 'Request has already been processed' });
    }
    
    // Update user's visibility settings
    const user = await User.findById(request.userId);
    if (!user) {
      console.log('User not found:', request.userId);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('User found:', {
      id: user._id,
      currentVisibleCountries: user.visibleCountries,
      currentVisibleRegions: user.visibleRegions
    });
    
    // Add requested countries and regions to user's visible lists
    const newVisibleCountries = [...new Set([...user.visibleCountries, ...request.requestedCountries])];
    const newVisibleRegions = [...new Set([...user.visibleRegions, ...request.requestedRegions])];
    
    console.log('New visibility settings:', {
      countries: newVisibleCountries,
      regions: newVisibleRegions
    });
    
    await User.findByIdAndUpdate(request.userId, {
      visibleCountries: newVisibleCountries,
      visibleRegions: newVisibleRegions,
      hasVisibilityRestrictions: true
    });
    
    // Update request status
    await RegionAccessRequest.findByIdAndUpdate(requestId, {
      status: 'approved',
      processedAt: new Date(),
      processedBy: adminId,
      adminNotes
    });
    
    // Send real-time notification to user
    sendNotificationToUser(request.userId, {
      type: 'request_approved',
      message: `Your request for ${request.requestedCountries.join(', ')} has been approved! Your access has been updated.`,
      requestId: request._id,
      countries: request.requestedCountries,
      regions: request.requestedRegions,
      timestamp: new Date().toISOString()
    });
    
    console.log('Request approved successfully');
    res.json({ success: true, message: 'Request approved successfully' });
  } catch (error) {
    console.error('Error approving request:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// Admin: Deny request
router.put('/admin/:requestId/deny', adminRequired, async (req, res) => {
  try {
    console.log('=== ADMIN DENIAL ===');
    const { requestId } = req.params;
    const { adminNotes = '' } = req.body || {};
    const adminId = req.user.id;
    
    console.log('Denying request:', requestId, 'by admin:', adminId, 'reason:', adminNotes);
    
    const request = await RegionAccessRequest.findById(requestId);
    if (!request) {
      console.log('Request not found:', requestId);
      return res.status(404).json({ error: 'Request not found' });
    }
    
    console.log('Request found:', {
      id: request._id,
      userId: request.userId,
      status: request.status,
      countries: request.requestedCountries,
      regions: request.requestedRegions
    });
    
    if (request.status !== 'pending') {
      console.log('Request already processed:', request.status);
      return res.status(400).json({ error: 'Request has already been processed' });
    }
    
    // Update request status
    await RegionAccessRequest.findByIdAndUpdate(requestId, {
      status: 'denied',
      processedAt: new Date(),
      processedBy: adminId,
      adminNotes
    });
    
    // Send real-time notification to user
    const reason = adminNotes ? ` Reason: ${adminNotes}` : '';
    sendNotificationToUser(request.userId, {
      type: 'request_denied',
      message: `Your request for ${request.requestedCountries.join(', ')} has been denied.${reason}`,
      requestId: request._id,
      countries: request.requestedCountries,
      regions: request.requestedRegions,
      reason: adminNotes,
      timestamp: new Date().toISOString()
    });
    
    console.log('Request denied successfully');
    res.json({ success: true, message: 'Request denied' });
  } catch (error) {
    console.error('Error denying request:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to deny request' });
  }
});

export default router;
