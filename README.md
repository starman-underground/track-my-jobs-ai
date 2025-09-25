# Track My Jobs AI

> **Privacy-first AI-powered job application tracking and organization platform**

If AI can take our jobs, it can help us find one.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19.1.0-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.1.4-38B2AC.svg)](https://tailwindcss.com/)

## Features

### **Privacy-First Architecture**
- **100% Local Processing**: Your data never leaves your browser
- **No Server Storage**: All analysis happens on your device
- **Secure OAuth**: Industry-standard Google authentication
- **Open Source**: Complete transparency in data handling

### **AI-Powered Organization**
- **Smart Email Analysis**: Automatically categorizes job-related emails
- **Application Tracking**: Monitors the status of your job applications
- **Deadline Management**: Never miss important follow-ups or deadlines
- **Progress Visualization**: Clear overview of your job search pipeline

### **Gmail Integration**
- **Seamless Connection**: Connect your Gmail account with read-only access
- **Intelligent Parsing**: Extracts relevant information from job emails
- **Date Range Filtering**: Analyze emails from specific time periods
- **Real-time Sync**: Stay up-to-date with your latest communications

### **Modern User Experience**
- **Clean Interface**: Intuitive design focused on productivity
- **Dark/Light Mode**: Comfortable viewing in any environment
- **Responsive Design**: Works perfectly on desktop and mobile
- **Fast Performance**: Built with modern React and Vite for speed

## Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **Google Account** for OAuth authentication

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/track-my-jobs-ai.git
   cd track-my-jobs-ai
   ```

2. **Install dependencies**
   ```bash
   cd react-frontend
   npm install
   ```

3. **Set up Google OAuth**
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/)
   - Enable Gmail API and Google+ API
   - Create OAuth 2.0 credentials
   - Add your domain to authorized origins

4. **Configure environment variables**
   ```bash
   # Create .env file in react-frontend directory
   VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to `http://localhost:3000` to start using the application.

## Tech Stack

### **Frontend (Current)**
- **React 19.1.0** - Modern UI library with latest features
- **React Router v7.7.1** - Advanced routing and navigation
- **TypeScript 5.8.3** - Type-safe JavaScript development
- **Tailwind CSS 4.1.4** - Utility-first CSS framework
- **Vite 6.3.3** - Fast build tool and dev server
- **Google OAuth** - Secure authentication integration

### **Backend (Planned)**
- **Django** - Python web framework for robust backend
- **PostgreSQL/SQLite** - Relational database for user data
- **Django REST Framework** - API development
- **Celery** - Asynchronous task processing for notifications
- **Redis** - Caching and message broker

## Project Structure

```
track-my-jobs-ai/
├── react-frontend/           # React application
│   ├── app/                 # Main application code
│   │   ├── contexts/        # React contexts (UserContext)
│   │   ├── routes/          # Page components
│   │   │   ├── home.tsx     # Landing page
│   │   │   ├── dashboard.tsx # Main dashboard
│   │   │   └── 404.tsx      # Error page
│   │   ├── welcome/         # Welcome components and assets
│   │   └── root.tsx         # Root layout component
│   ├── public/              # Static assets
│   ├── package.json         # Dependencies and scripts
│   └── vite.config.ts       # Vite configuration
└── backend/                 # Django backend (coming soon)
    ├── api/                 # REST API endpoints
    ├── models/              # Database models
    ├── services/            # Business logic
    └── notifications/       # Email/push notification system
```

## Development Roadmap

### **Phase 1: Frontend Foundation**
- [x] React application setup with React Router v7
- [x] Google OAuth integration
- [x] Gmail API integration for email reading
- [x] Basic email parsing and display
- [x] Responsive UI with dark/light mode

### **Phase 2: AI & Analytics**
- [ ] Local AI model integration for email classification
- [ ] Job application status detection
- [ ] Deadline and follow-up identification
- [ ] Progress tracking and visualization
- [ ] Export functionality (CSV, PDF)

### **Phase 3: Backend Integration**
- [ ] Django REST API development
- [ ] User account management
- [ ] Data synchronization across devices
- [ ] Email notifications and reminders
- [ ] Advanced analytics and reporting

### **Phase 4: Advanced Features**
- [ ] Calendar integration for interview scheduling
- [ ] Document management (resumes, cover letters)
- [ ] Company research integration
- [ ] Networking contact tracking
- [ ] Mobile app development

## Privacy & Security

- **Local Processing**: All AI analysis happens in your browser
- **No Data Collection**: We don't store or transmit your personal data
- **OAuth Security**: Industry-standard authentication protocols
- **Open Source**: Full transparency - audit the code yourself
- **GDPR Compliant**: Designed with privacy regulations in mind

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### **Ways to Contribute**
- 🐛 **Report Bugs**: Found an issue? Let us know!
- 💡 **Suggest Features**: Have ideas for improvements?
- 🔧 **Submit PRs**: Help us build new features
- 📚 **Improve Docs**: Help others understand the project
- 🧪 **Testing**: Help us ensure quality across devices

### **Development Setup**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`npm run typecheck`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Google** for OAuth and Gmail API services
- **React Team** for the amazing framework
- **Tailwind CSS** for the utility-first CSS framework
- **Open Source Community** for inspiration and tools

## 📞 Support

- **Documentation**: Coming soon
- **Issues**: [GitHub Issues](https://github.com/your-username/track-my-jobs-ai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/track-my-jobs-ai/discussions)

---

<div align="center">

**Built with ❤️ for job seekers who value their privacy**

[🌟 Star this repo](https://github.com/your-username/track-my-jobs-ai) • [🐛 Report Bug](https://github.com/your-username/track-my-jobs-ai/issues) • [✨ Request Feature](https://github.com/your-username/track-my-jobs-ai/issues)

</div>
