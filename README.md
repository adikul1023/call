# SecureVoice - Secure Voice Calling Platform

A modern, secure voice calling application with database authentication, user management, and automatic P2P handshake.

## Features

- 🔐 **Secure Authentication**: User registration and login with password hashing and salt
- 👥 **User Management**: Friend system and online user tracking
- 📞 **Voice Calling**: High-quality encrypted voice calls
- 🔄 **Automatic Signaling**: No manual SDP exchange required
- 💾 **Persistent Storage**: SQLite database for user data and call sessions
- 🌐 **Real-time Communication**: WebSocket-based signaling server
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎤 **Audio Controls**: Mute/unmute functionality with visual indicators

## Architecture

### Backend (Node.js + Express)
- **Database**: SQLite with user authentication, friends, and call sessions
- **Authentication**: bcryptjs for password hashing with salt
- **WebSocket Server**: Real-time signaling for WebRTC handshake
- **REST API**: User management, friend system, call initiation

### Frontend (Vanilla JavaScript)
- **Authentication UI**: Login/register forms with validation
- **User Dashboard**: Friend management and online users
- **Call Interface**: Voice calling with mute controls and audio indicators
- **Real-time Updates**: WebSocket integration for live updates

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

### 3. Access the Application
- Open your browser and go to: `http://localhost:3000`
- WebSocket server runs on: `ws://localhost:8080`

## Database Schema

### Users Table
- `id`: Primary key
- `username`: Unique username
- `password_hash`: bcrypt hashed password
- `salt`: Password salt
- `created_at`: Registration timestamp
- `last_login`: Last login timestamp
- `is_online`: Online status

### Friends Table
- `user_id`: User ID
- `friend_id`: Friend's user ID
- `status`: Friendship status (pending/accepted)
- `created_at`: Friendship creation timestamp

### Call Sessions Table
- `id`: Unique session ID
- `caller_id`: Caller's user ID
- `callee_id`: Callee's user ID
- `status`: Call status (initiated/accepted/ended)
- `created_at`: Call start timestamp
- `ended_at`: Call end timestamp

### Signaling Messages Table
- `session_id`: Associated call session
- `from_user_id`: Sender's user ID
- `to_user_id`: Recipient's user ID
- `message_type`: Message type (offer/answer/ice-candidate)
- `message_data`: JSON message data
- `created_at`: Message timestamp

## API Endpoints

### Authentication
- `POST /api/register` - User registration
- `POST /api/login` - User login
- `POST /api/logout` - User logout

### User Management
- `GET /api/users/online` - Get online users
- `POST /api/friends/add` - Add friend
- `GET /api/friends/:userId` - Get user's friends

### Call Management
- `POST /api/call/initiate` - Start a voice call
- `POST /api/call/accept` - Accept incoming call
- `POST /api/call/end` - End a call

## WebSocket Events

### Client to Server
- `authenticate` - Authenticate user connection
- `signaling_message` - Send WebRTC signaling data
- `call_response` - Respond to incoming call

### Server to Client
- `authenticated` - Authentication confirmation
- `call_incoming` - Incoming call notification
- `call_response` - Call acceptance/decline
- `signaling_message` - WebRTC signaling data

## Security Features

- **Password Hashing**: bcryptjs with salt for secure password storage
- **Input Validation**: Server-side validation for all inputs
- **SQL Injection Protection**: Parameterized queries
- **CORS Configuration**: Proper cross-origin resource sharing
- **WebSocket Authentication**: User authentication for WebSocket connections

## Usage

### 1. Registration
- Create a new account with username and password
- Password must be at least 6 characters

### 2. Adding Friends
- Enter a friend's username in the "Add Friend" section
- Friends will appear in your friends list when online

### 3. Making Calls
- Select an online friend or user
- Click "Start Call" to initiate
- Use call controls for voice/video options

### 4. Receiving Calls
- Incoming calls will show a notification
- Accept or decline the call
- Use call controls during the call

## Development

### Project Structure
```
SecureVoice/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── public/
│   └── index.html         # Frontend application
├── securevoice.db         # SQLite database (created on first run)
└── README.md              # This file
```

### Key Technologies
- **Backend**: Node.js, Express.js, SQLite3, WebSocket
- **Security**: bcryptjs, CORS
- **Frontend**: Vanilla JavaScript, WebRTC API
- **Database**: SQLite with SQLite3 driver

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   - Change PORT in server.js or kill existing processes
   - Default ports: 3000 (HTTP), 8080 (WebSocket)

2. **Database Errors**
   - Delete `securevoice.db` to reset database
   - Check file permissions

3. **WebRTC Connection Issues**
   - Ensure HTTPS in production
   - Check firewall settings
   - Verify STUN server availability

4. **WebSocket Connection Failed**
   - Check if port 8080 is available
   - Verify firewall settings
   - Ensure server is running

## Production Deployment

### Environment Variables
```bash
PORT=3000                    # HTTP server port
NODE_ENV=production         # Environment mode
```

### Security Considerations
- Use HTTPS in production
- Implement rate limiting
- Add input sanitization
- Use environment variables for secrets
- Implement proper logging
- Add database backups

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- Check the troubleshooting section
- Review the API documentation
- Check browser console for errors
- Verify all dependencies are installed
