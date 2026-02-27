import React from 'react';

const LoadingAnimation = ({ message = "Loading..." }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.9)', // Matching #0f172a from App.js
      backdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.5s ease-out'
    }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '450px', padding: '20px' }}>
        
        {/* The Main Glass Card */}
        <div style={{
          backgroundColor: 'rgba(30, 41, 59, 0.8)',
          borderRadius: '32px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          padding: '60px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden'
        }}>
          
          {/* Animated Background Stadium Glow */}
          <div style={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: 'conic-gradient(from 0deg, transparent, rgba(99, 102, 241, 0.1), transparent 40%)',
            animation: 'spin 4s linear infinite',
            zIndex: -1
          }}></div>

          {/* GIF Container */}
          <div style={{ position: 'relative' }}>
            <div style={{
              width: '160px',
              height: '160px',
              borderRadius: '24px',
              overflow: 'hidden',
              border: '4px solid rgba(255, 255, 255, 0.05)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              background: '#000'
            }}>
              <img
                src="/assets/Untitled file.gif"
                alt="Cricket Animation"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            </div>
            
            {/* Spinning Accent Ring */}
            <div style={{
              position: 'absolute',
              top: '-10px',
              left: '-10px',
              right: '-10px',
              bottom: '-10px',
              borderRadius: '30px',
              border: '2px solid transparent',
              borderTopColor: '#6366f1',
              borderBottomColor: '#a855f7',
              animation: 'spin 2s linear infinite'
            }}></div>
          </div>

          {/* Text Section */}
          <div style={{ textAlign: 'center' }}>
            <h3 style={{
              fontSize: '24px',
              fontWeight: '900',
              color: '#ffffff',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              marginBottom: '12px',
              animation: 'pulse 2s infinite'
            }}>
              {message}
            </h3>
            
            {/* Elegant Loading Bar instead of dots */}
            <div style={{
              width: '120px',
              height: '4px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: '10px',
              margin: '0 auto 20px',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: '-100%',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(to right, #6366f1, #a855f7)',
                animation: 'loadingSweep 1.5s infinite ease-in-out'
              }}></div>
            </div>
            
            <p style={{
              color: '#94a3b8',
              fontSize: '13px',
              fontWeight: '600',
              letterSpacing: '0.5px',
              opacity: 0.8
            }}>
              SYNCING AUCTION DATA

            <h2 style={{ fontSize: '30px', color: '#94a3b8', marginTop: '8px' }}>Developed By Pankaj Narwade Patil</h2>
            </p>
          </div>
        </div>

        {/* Massive Outer Background Glow */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '300px',
          height: '300px',
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          filter: 'blur(80px)',
          borderRadius: '50%',
          zIndex: 0
        }}></div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes loadingSweep {
          0% { left: -100%; }
          50% { left: 100%; }
          100% { left: 100%; }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(0.98); }
        }
      `}</style>
    </div>
  );
};

export default LoadingAnimation;