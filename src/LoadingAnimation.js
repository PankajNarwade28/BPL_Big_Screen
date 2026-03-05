import React from 'react';

const LoadingAnimation = ({ message = "Loading..." }) => {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#020617', // Deeper slate for better contrast
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Background Ambient "Stadium" Lights */}
      <div className="stadium-light" style={{ left: '10%', top: '10%', background: '#6366f1' }}></div>
      <div className="stadium-light" style={{ right: '10%', bottom: '10%', background: '#a855f7' }}></div>

      <div style={{ position: 'relative', width: '90%', maxWidth: '400px' }}>
        
        {/* Main Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: '40px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '48px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          textAlign: 'center'
        }}>
          
          {/* Animated Visual Container */}
          <div style={{ position: 'relative', marginBottom: '40px' }}>
            {/* Pulsing Outer Ring */}
            <div className="pulse-ring"></div>
            
            {/* Image/GIF Frame */}
            <div style={{
              width: '140px',
              height: '140px',
              borderRadius: '50%', // Circle looks more "premium" for avatars/logos
              overflow: 'hidden',
              border: '4px solid #6366f1',
              boxShadow: '0 0 30px rgba(99, 102, 241, 0.4)',
              background: '#000',
              position: 'relative',
              zIndex: 2
            }}>
              <img
                src="/assets/Untitled file.gif"
                alt="Cricket"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          </div>

          {/* Text Content */}
          <div style={{ width: '100%' }}>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '800',
              color: '#fff',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              margin: '0 0 16px 0',
            }}>
              {message}
            </h3>
            
            {/* Enhanced Loading Bar */}
            <div style={{
              width: '180px',
              height: '6px',
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: '20px',
              margin: '0 auto 24px',
              overflow: 'hidden',
              position: 'relative',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div className="progress-bar-fill"></div>
            </div>
            
            <p style={{
              color: '#64748b',
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '1.5px',
              margin: '0',
              opacity: 0.9
            }}>
              INITIALIZING AUCTION ENGINE
            </p>
          </div>
        </div>

        {/* Subtle Branding Footer */}
        <div style={{
          marginTop: '24px',
          textAlign: 'center',
          animation: 'fadeIn 1s ease-in'
        }}>
          <span style={{ 
            color: 'rgba(255,255,255,0.3)', 
            fontSize: '10px', 
            fontWeight: '500', 
            letterSpacing: '1px' 
          }}>
            DEVELOPED BY 
            <span style={{ color: '#6366f1', marginLeft: '5px' }}>PANKAJ NARWADE PATIL</span>
          </span>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        
        .stadium-light {
          position: absolute;
          width: 40vw;
          height: 40vw;
          filter: blur(120px);
          opacity: 0.15;
          border-radius: 50%;
          pointer-events: none;
          animation: pulse 6s infinite alternate;
        }

        .pulse-ring {
          position: absolute;
          inset: -15px;
          border-radius: 50%;
          border: 2px solid #6366f1;
          opacity: 0;
          animation: ripple 2s infinite;
        }

        .progress-bar-fill {
          position: absolute;
          height: 100%;
          width: 40%;
          background: linear-gradient(90deg, #6366f1, #a855f7);
          border-radius: 20px;
          box-shadow: 0 0 10px #6366f1;
          animation: slide 1.5s infinite ease-in-out;
        }

        @keyframes slide {
          0% { left: -40%; width: 20%; }
          50% { width: 50%; }
          100% { left: 100%; width: 20%; }
        }

        @keyframes ripple {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.3); opacity: 0; }
        }

        @keyframes pulse {
          0% { opacity: 0.1; transform: scale(1); }
          100% { opacity: 0.2; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};

export default LoadingAnimation;