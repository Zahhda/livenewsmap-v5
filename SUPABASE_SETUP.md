# Supabase Integration Setup Guide

This guide will help you set up Supabase for the modern messaging system.

## 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in to your account
3. Click "Start your project"
4. Create a new project:
   - Choose your organization
   - Enter project name: "live-news-map-messaging"
   - Enter database password (save this securely)
   - Choose region closest to your users
   - Click "Create new project"

## 2. Get Project Credentials

1. In your Supabase dashboard, go to Settings > API
2. Copy the following values:
   - **Project URL** (looks like: `https://your-project.supabase.co`)
   - **Anon public key** (starts with `eyJ...`)

## 3. Set Up Environment Variables

Create a `.env` file in your project root:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

## 4. Run Database Schema

1. In your Supabase dashboard, go to SQL Editor
2. Copy the contents of `supabase-schema.sql`
3. Paste and run the SQL script
4. This will create all necessary tables and functions

## 5. Configure Authentication

1. Go to Authentication > Settings in your Supabase dashboard
2. Configure your authentication providers
3. Set up email templates if needed
4. Configure redirect URLs for your domain

## 6. Set Up Row Level Security (RLS)

The schema includes RLS policies, but you may need to adjust them based on your requirements:

1. Go to Authentication > Policies in your Supabase dashboard
2. Review the policies for each table
3. Modify as needed for your use case

## 7. Test the Integration

1. Start your application: `npm start`
2. Open the admin users page
3. Try sending messages between users
4. Check the Supabase dashboard to see data being created

## 8. Features Included

✅ **Real-time messaging** with Supabase subscriptions
✅ **Modern UI** with clean icons and animations
✅ **User management** with search and filtering
✅ **Message status** (read/unread indicators)
✅ **Typing indicators** with presence
✅ **Notifications** for new messages
✅ **Responsive design** that works on all devices

## 9. Customization

### Icons
- All emoji stickers have been replaced with modern SVG icons
- Icons are defined in `/src/components/Icons.js`
- Easy to customize colors, sizes, and styles

### Styling
- Modern gradient backgrounds
- Smooth animations and transitions
- Dark theme optimized
- Mobile-responsive design

### Messaging Features
- Real-time message delivery
- Typing indicators
- Read receipts
- Message timestamps
- User presence

## 10. Troubleshooting

### Common Issues

1. **CORS Errors**: Make sure your domain is added to Supabase allowed origins
2. **Authentication Issues**: Check your RLS policies and user permissions
3. **Real-time Not Working**: Verify your Supabase project is active and not paused
4. **Module Import Errors**: Make sure you're using the correct import paths

### Debug Mode

Enable debug logging by adding this to your browser console:
```javascript
localStorage.setItem('supabase-debug', 'true')
```

## 11. Production Deployment

1. Update your environment variables in production
2. Configure proper CORS settings
3. Set up database backups
4. Monitor usage and performance
5. Consider upgrading to a paid plan for higher limits

## 12. Support

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord Community](https://discord.supabase.com)
- [GitHub Issues](https://github.com/supabase/supabase/issues)

---

**Note**: This integration uses Supabase's free tier, which includes:
- 500MB database storage
- 2GB bandwidth
- 50,000 monthly active users
- Real-time subscriptions
- Authentication
- Row Level Security

For production use with higher limits, consider upgrading to a paid plan.
