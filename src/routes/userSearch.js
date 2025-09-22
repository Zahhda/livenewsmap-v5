import express from 'express';
import User from '../models/User.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

// Search users for messaging
router.get('/search', authRequired, async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    const userId = req.user.id;
    
    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    const searchTerm = q.trim();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Search users by name or email (excluding current user)
    const users = await User.find({
      _id: { $ne: userId }, // Exclude current user
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ]
    })
    .select('name email avatar profilePicture role createdAt')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ name: 1 });
    
    const total = await User.countDocuments({
      _id: { $ne: userId },
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ]
    });
    
    console.log('User search results:', users.map(u => ({ id: u._id, name: u.name, email: u.email })));
    
    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users'
    });
  }
});

// Get all users (for admin or specific use cases)
router.get('/all', authRequired, async (req, res) => {
  try {
    const { page = 1, limit = 50, role } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query - admins can see all users, regular users only see other users
    const query = { _id: { $ne: userId } }; // Exclude current user
    if (role) {
      query.role = role;
    }
    
    // If not admin, limit to users with messaging permissions
    if (userRole !== 'admin') {
      query.isActive = true; // Only show active users
    }
    
    const users = await User.find(query)
      .select('name email avatar profilePicture role createdAt lastLogin')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ name: 1 });
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Get user profile for messaging
router.get('/:userId/profile', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('name email avatar profilePicture role createdAt lastLogin');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

// Get online users (if you want to show who's online)
router.get('/online', authRequired, async (req, res) => {
  try {
    // This would typically be handled by Socket.IO
    // For now, we'll return a placeholder
    res.json({
      success: true,
      onlineUsers: [],
      message: 'Online users are managed by Socket.IO'
    });
  } catch (error) {
    console.error('Error fetching online users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch online users'
    });
  }
});

export default router;
