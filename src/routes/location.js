import express from 'express';
import { authRequired, adminRequired } from '../middleware/auth.js';
import UserLocation from '../models/UserLocation.js';
import User from '../models/User.js';

const router = express.Router();

// Share current location
router.post('/share', authRequired, async (req, res) => {
  try {
    const { latitude, longitude, timestamp } = req.body;
    const userId = req.user.id;

    // Validate coordinates
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Deactivate previous location for this user
    await UserLocation.updateMany(
      { userId, isActive: true },
      { isActive: false }
    );

    // Create new location record
    const location = new UserLocation({
      userId,
      latitude,
      longitude,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      isActive: true
    });

    await location.save();

    res.json({ 
      success: true, 
      message: 'Location shared successfully',
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: location.timestamp
      }
    });

  } catch (error) {
    console.error('Location sharing error:', error);
    res.status(500).json({ error: 'Failed to share location' });
  }
});

// Get user's own location history
router.get('/my-locations', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, page = 1 } = req.query;

    const locations = await UserLocation.find({ userId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    res.json({ locations });

  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Failed to get locations' });
  }
});

// Admin: Get all user locations
router.get('/admin/all', adminRequired, async (req, res) => {
  try {
    const { limit = 100, page = 1 } = req.query;

    // Get active locations with user details
    const locations = await UserLocation.find({ isActive: true })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Get user details for each location
    const locationsWithUsers = await Promise.all(
      locations.map(async (location) => {
        const user = await User.findById(location.userId);
        return {
          _id: location._id,
          userId: location.userId,
          userName: user?.name || 'Unknown User',
          userEmail: user?.email || 'Unknown Email',
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          timestamp: location.timestamp,
          createdAt: location.createdAt
        };
      })
    );

    res.json({ locations: locationsWithUsers });

  } catch (error) {
    console.error('Get all locations error:', error);
    res.status(500).json({ error: 'Failed to get locations' });
  }
});

// Admin: Get locations for specific user
router.get('/admin/user/:userId', adminRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, page = 1 } = req.query;

    const locations = await UserLocation.find({ userId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const user = await User.findById(userId);

    res.json({ 
      locations,
      user: {
        id: user?._id,
        name: user?.name,
        email: user?.email
      }
    });

  } catch (error) {
    console.error('Get user locations error:', error);
    res.status(500).json({ error: 'Failed to get user locations' });
  }
});

// Admin: Delete location
router.delete('/admin/:locationId', adminRequired, async (req, res) => {
  try {
    const { locationId } = req.params;

    const location = await UserLocation.findByIdAndDelete(locationId);
    
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ success: true, message: 'Location deleted successfully' });

  } catch (error) {
    console.error('Delete location error:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

export default router;
