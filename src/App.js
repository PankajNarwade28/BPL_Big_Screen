import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

// const SOCKET_URL = 'https://aplplayerauction.onrender.com/';
// const API_URL = 'https://aplplayerauction.onrender.com/api';
const SOCKET_URL = 'http://localhost:5000'
const API_URL = 'http://localhost:5000/api'
// Default placeholder image (SVG data URL)
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="40" dy="110" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3E%F0%9F%8F%8F%3C/text%3E%3C/svg%3E';

function App() {
  const [socket, setSocket] = useState(null);
  const [auctionState, setAuctionState] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [timerValue, setTimerValue] = useState(20);
  const [currentBid, setCurrentBid] = useState({ amount: 5, teamName: 'No Bids Yet' });
  const [recentlySold, setRecentlySold] = useState([]);
  const [showSoldAnimation, setShowSoldAnimation] = useState(false);
  const [soldInfo, setSoldInfo] = useState(null);
  const [soldAnimationTimeout, setSoldAnimationTimeout] = useState(null);

  useEffect(() => {
    // Connect to socket with reconnection options
    const newSocket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });
    setSocket(newSocket);

    // Emit big screen connection
    newSocket.emit('bigscreen:connect');

    // Handle connection events
    newSocket.on('connect', () => {
      console.log('Big screen connected');
      newSocket.emit('bigscreen:connect');
    });

    newSocket.on('disconnect', () => {
      console.log('Big screen disconnected');
    });

    newSocket.on('reconnect', () => {
      console.log('Big screen reconnected');
      newSocket.emit('bigscreen:connect');
    });

    // Listen for auction state
    newSocket.on('auction:state', (data) => {
      if (data.state) {
        setAuctionState(data.state);
        if (data.state.currentPlayer) {
          setCurrentPlayer(data.state.currentPlayer);
          setCurrentBid({
            amount: data.state.currentHighBid.amount,
            teamName: data.state.currentHighBid.team?.teamName || 'No Bids Yet'
          });
        } else {
          // No active auction - clear current player
          setCurrentPlayer(null);
        }
        if (data.state.recentlySold) {
          setRecentlySold(data.state.recentlySold);
        }
        setTimerValue(data.timerValue || 20);
      }
    });

    // Listen for auction started
    newSocket.on('auction:started', (data) => {
      // Clear any pending sold animation timeout
      if (soldAnimationTimeout) {
        clearTimeout(soldAnimationTimeout);
        setSoldAnimationTimeout(null);
      }
      
      setShowSoldAnimation(false);
      setCurrentPlayer(data.player);
      setCurrentBid({ amount: data.basePrice, teamName: 'Base Price' });
      setTimerValue(data.timerValue);
    });

    // Listen for new bids
    newSocket.on('bid:new', (data) => {
      setCurrentBid({
        amount: data.amount,
        teamName: data.teamName
      });
    });

    // Listen for timer updates
    newSocket.on('timer:update', (data) => {
      setTimerValue(data.value);
    });

    // Listen for timer reset
    newSocket.on('timer:reset', (data) => {
      setTimerValue(data.value);
    });

    // Listen for player sold
    newSocket.on('player:sold', (data) => {
      // Clear any existing timeout
      if (soldAnimationTimeout) {
        clearTimeout(soldAnimationTimeout);
      }
      
      setSoldInfo(data);
      setShowSoldAnimation(true);
      
      // Hide animation after 5 seconds but don't clear player
      const timeout = setTimeout(() => {
        setShowSoldAnimation(false);
        setSoldAnimationTimeout(null);
        // Don't set currentPlayer to null - let the next auction or explicit state change handle it
      }, 5000);
      
      setSoldAnimationTimeout(timeout);

      // Update recently sold
      if (data.team) {
        setRecentlySold(prev => [
          { player: data.player, team: data.team, amount: data.amount, soldAt: new Date() },
          ...prev.slice(0, 9)
        ]);
      }
    });

    // Cleanup
    return () => {
      if (soldAnimationTimeout) {
        clearTimeout(soldAnimationTimeout);
      }
      newSocket.close();
    };
  }, []);

  const getTimerColor = () => {
    if (timerValue > 15) return '#4CAF50'; // Green
    if (timerValue > 5) return '#FFC107'; // Yellow
    return '#F44336'; // Red
  };

  const formatStat = (value) => {
    return value !== undefined && value !== null ? value : '-';
  };

  return (
    <div className="app">
      {showSoldAnimation && soldInfo ? (
        <div className="sold-animation">
          <div className="sold-content">
            <h1 className="sold-text">{soldInfo.team ? 'SOLD' : 'UNSOLD'}</h1>
            <div className="sold-player-info">
              <img 
                src={soldInfo.player.photo?.startsWith('http') ? soldInfo.player.photo : `${SOCKET_URL}${soldInfo.player.photo}`} 
                
                alt={soldInfo.player.name}
                className="sold-player-photo"
                onError={(e) => e.target.src = PLACEHOLDER_IMAGE}
              />
              {console.log(`${SOCKET_URL}${soldInfo.player.photo}`)}
              <h2>{soldInfo.player.name}</h2>
              <h3>{soldInfo.team ? soldInfo.team.teamName : 'UNSOLD'}</h3>
              <div className="sold-amount">₹{soldInfo.amount} Points</div>
            </div>
          </div>
        </div>
      ) : currentPlayer ? (
        <div className="main-screen">
          <div className="header">
            <h1>LIVE AUCTION</h1>
          </div>

          <div className="content-grid">
            <div className="player-section">
              <div className="player-card">
                <img 
                  src={currentPlayer.photo?.startsWith('http') ? currentPlayer.photo : `${SOCKET_URL}${currentPlayer.photo}`} 
                  alt={currentPlayer.name}
                  className="player-photo"
                  onError={(e) => e.target.src = PLACEHOLDER_IMAGE}
                />
                <div className="player-info">
                  <h2 className="player-name">{currentPlayer.name}</h2>
                  <span className="player-category">{currentPlayer.category}</span>
                  
                  <div className="player-stats">
                    <div className="stat">
                      <span className="stat-label">Matches</span>
                      <span className="stat-value">{formatStat(currentPlayer.stats?.matches)}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Runs</span>
                      <span className="stat-value">{formatStat(currentPlayer.stats?.runs)}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Wickets</span>
                      <span className="stat-value">{formatStat(currentPlayer.stats?.wickets)}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Average</span>
                      <span className="stat-value">{formatStat(currentPlayer.stats?.average)}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Strike Rate</span>
                      <span className="stat-value">{formatStat(currentPlayer.stats?.strikeRate)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bid-section">
              <div className="timer-container">
                <div 
                  className="timer"
                  style={{ 
                    backgroundColor: getTimerColor(),
                    animation: timerValue <= 5 ? 'pulse 1s infinite' : 'none'
                  }}
                >
                  <span className="timer-value">{timerValue}</span>
                </div>
              </div>

              <div className="current-bid">
                <div className="bid-label">CURRENT BID</div>
                <div className="bid-amount">₹{currentBid.amount}</div>
                <div className="bid-team">{currentBid.teamName}</div>
              </div>

              <div className="base-price">
                Base Price: ₹{currentPlayer.basePrice}
              </div>
            </div>
          </div>

          <div className="ticker">
            <div className="ticker-title">RECENTLY SOLD</div>
            <div className="ticker-content">
              {recentlySold.length > 0 ? (
                recentlySold.map((item, index) => (
                  <div key={index} className="ticker-item">
                    <span className="ticker-player">{item.player?.name || 'Player'}</span>
                    <span className="ticker-separator">→</span>
                    <span className="ticker-team">{item.team?.teamName || 'Team'}</span>
                    <span className="ticker-price">₹{item.amount}</span>
                  </div>
                ))
              ) : (
                <div className="ticker-item">No players sold yet</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="waiting-screen">
          <h1>Waiting for Auction to Start...</h1>
          <div className="waiting-message">
            Admin will begin the auction shortly
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
