import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import LoadingAnimation from './LoadingAnimation';
import TeamPurseBar from './TeamPurseBar';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000/';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const PLACEHOLDER_IMAGE = `${SOCKET_URL}uploads/defaultPlayer.png`;
const DEFAULT_TEAM_LOGO = `${SOCKET_URL}uploads/defaultTeam.png`;

function App() {
  const [socket, setSocket] = useState(null);
  const [auctionState, setAuctionState] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [timerValue, setTimerValue] = useState(20);
  const [currentBid, setCurrentBid] = useState({ amount: 5, teamName: 'No Bids Yet', team: null });
  const [recentlySold, setRecentlySold] = useState([]);
  const [showSoldAnimation, setShowSoldAnimation] = useState(false);
  const [soldInfo, setSoldInfo] = useState(null);
  const [soldAnimationTimeout, setSoldAnimationTimeout] = useState(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [showBidAnimation, setShowBidAnimation] = useState(false);
  const [bidAnimationData, setBidAnimationData] = useState(null);
  const [showTeamSummary, setShowTeamSummary] = useState(false);
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const response = await fetch(`${API_URL}/teams`);
        if (response.ok) {
          const data = await response.json();
          if (data.teams && Array.isArray(data.teams)) {
            setTeams(data.teams);
          } else if (Array.isArray(data)) {
            setTeams(data);
          }
        }
      } catch (error) { console.error('Error fetching teams:', error); }
    };
    fetchTeams();
    const interval = setInterval(fetchTeams, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setTimeout(() => setIsConnecting(false), 1000);
      newSocket.emit('bigscreen:connect');
    });

    newSocket.on('auction:state', (data) => {
      if (data.state) {
        setAuctionState(data.state);
        if (data.state.currentPlayer) {
          setCurrentPlayer(data.state.currentPlayer);
          setCurrentBid({
            amount: data.state.currentHighBid.amount,
            teamName: data.state.currentHighBid.team?.teamName || 'No Bids Yet',
            team: data.state.currentHighBid.team || null
          });
        } else { setCurrentPlayer(null); }
        if (data.state.recentlySold) setRecentlySold(data.state.recentlySold);
        setTimerValue(data.timerValue || 20);
      }
    });

    newSocket.on('auction:started', (data) => {
      if (soldAnimationTimeout) clearTimeout(soldAnimationTimeout);
      setShowSoldAnimation(false);
      setCurrentPlayer(data.player);
      setCurrentBid({ amount: data.basePrice, teamName: 'Base Price', team: null });
      setTimerValue(data.timerValue);
    });

    newSocket.on('bid:new', async (data) => {
      let teamData = data.team;
      if (!teamData && data.teamId) {
        try {
          const response = await fetch(`${API_URL}/teams`);
          if (response.ok) {
            const result = await response.json();
            const teamsArray = result.teams || result;
            teamData = teamsArray.find(t => t._id === data.teamId);
          }
        } catch (error) { console.error(error); }
      }
      setCurrentBid({ amount: data.amount, teamName: data.teamName, team: teamData || null });
      if (teamData || data.teamName) {
        const currentPurse = teamData?.remainingPoints || teamData?.purseBudget || 0;
        setBidAnimationData({
          teamName: data.teamName,
          teamLogo: teamData?.logo || '',
          amount: data.amount,
          remainingPurse: currentPurse - data.amount
        });
        setShowBidAnimation(true);
        setTimeout(() => setShowBidAnimation(false), 2000);
      }
    });

    newSocket.on('timer:update', (data) => setTimerValue(data.value));
    newSocket.on('timer:reset', (data) => setTimerValue(data.value));

    // Real-time team updates
    newSocket.on('teams:status', (data) => {
      if (data.teams && Array.isArray(data.teams)) {
        setTeams(data.teams);
      }
    });

    newSocket.on('player:sold', (data) => {
      if (soldAnimationTimeout) clearTimeout(soldAnimationTimeout);
      setSoldInfo(data);
      setShowSoldAnimation(true);
      newSocket.emit('bigscreen:summaryStarting');
      const timeout = setTimeout(() => {
        setShowSoldAnimation(false);
        setSoldAnimationTimeout(null);
        setShowTeamSummary(true);
        setTimeout(() => {
          setShowTeamSummary(false);
          newSocket.emit('bigscreen:summaryComplete');
        }, 10000);
      }, 5000);
      setSoldAnimationTimeout(timeout);
      if (data.team) {
        setRecentlySold(prev => [
          { player: data.player, team: data.team, amount: data.amount, soldAt: new Date() },
          ...prev.slice(0, 9)
        ]);
      }
    });

    return () => { if (soldAnimationTimeout) clearTimeout(soldAnimationTimeout); newSocket.close(); };
  }, []);

  const getTimerColor = () => {
    if (timerValue > 15) return '#10B981'; 
    if (timerValue > 5) return '#F59E0B'; 
    return '#EF4444'; 
  };

  const formatStat = (val) => val !== undefined && val !== null ? val : '-';

  return (
    <div className="min-h-screen h-screen overflow-hidden flex flex-col bg-slate-50 text-slate-900">
      {isConnecting && <LoadingAnimation message="Establishing Connection..." />}
      
      {showSoldAnimation && soldInfo ? (
        <div className="fixed inset-0 w-full h-full bg-white/95 flex items-center justify-center z-[1000] p-4 animate-in fade-in zoom-in duration-300">
          <div className="text-center scale-110">
            <div className="text-8xl mb-4 drop-shadow-xl animate-bounce">{soldInfo.team ? '🏆' : '⚪'}</div>
            <h1 className={`text-7xl md:text-9xl font-black mb-8 tracking-tighter uppercase ${soldInfo.team ? 'text-blue-600' : 'text-slate-400'}`}>
              {soldInfo.team ? 'SOLD!' : 'UNSOLD'}
            </h1>
            <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-2xl">
              <img 
                src={soldInfo.player.photo ? (soldInfo.player.photo.startsWith('http') ? soldInfo.player.photo : `${SOCKET_URL}${soldInfo.player.photo.replace(/^\/+/, '').startsWith('uploads') ? soldInfo.player.photo.replace(/^\/+/, '') : 'uploads/' + soldInfo.player.photo.replace(/^\/+/, '')}`) : PLACEHOLDER_IMAGE} 
                className="w-56 h-56 rounded-full object-cover border-8 border-slate-50 mx-auto mb-6 shadow-xl"
                onError={(e) => e.target.src = PLACEHOLDER_IMAGE}
                alt={soldInfo.player.name}
              />
              <h2 className="text-5xl font-bold mb-4 text-slate-800">{soldInfo.player.name}</h2>
              {soldInfo.team && (
                <div className="flex items-center justify-center gap-4 mb-6 bg-slate-100 p-4 rounded-2xl">
                  <img src={soldInfo.team.logo ? `${SOCKET_URL}${soldInfo.team.logo.replace(/^\/+/, '').startsWith('uploads') ? soldInfo.team.logo.replace(/^\/+/, '') : 'uploads/' + soldInfo.team.logo.replace(/^\/+/, '')}` : DEFAULT_TEAM_LOGO} className="w-16 h-16 rounded-full" alt={soldInfo.team.teamName} onError={(e) => e.target.src = DEFAULT_TEAM_LOGO} />
                  <h3 className="text-4xl font-black text-blue-700">{soldInfo.team.teamName}</h3>
                </div>
              )}
              <div className="text-6xl font-black text-white bg-blue-600 px-12 py-4 rounded-2xl shadow-lg">
                ₹{soldInfo.amount} <span className="text-2xl font-normal opacity-80">Points</span>
              </div>
            </div>
          </div>
        </div>
      ) : currentPlayer ? (
        <div className="flex flex-col h-full bg-slate-50">
          <div className="text-center py-6 bg-white border-b border-slate-200 shadow-sm">
            <h1 className="text-4xl font-black tracking-[0.1em] text-slate-800">
               CRICKET AUCTION <span className="text-blue-600">LIVE</span>
            </h1>
          </div>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 p-6 overflow-hidden">
            <div className="flex flex-col">
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl flex flex-col items-center">
                <img 
                  src={currentPlayer.photo ? (currentPlayer.photo.startsWith('http') ? currentPlayer.photo : `${SOCKET_URL}${currentPlayer.photo.replace(/^\/+/, '').startsWith('uploads') ? currentPlayer.photo.replace(/^\/+/, '') : 'uploads/' + currentPlayer.photo.replace(/^\/+/, '')}`) : PLACEHOLDER_IMAGE} 
                  className="w-56 h-56 rounded-3xl object-cover border-4 border-slate-100 shadow-lg mb-6 hover:scale-105 transition-transform"
                  onError={(e) => e.target.src = PLACEHOLDER_IMAGE}
                  alt={currentPlayer.name}
                />
                <h2 className="text-5xl font-black mb-2 text-slate-900">{currentPlayer.name}</h2>
                <div className="bg-slate-100 text-slate-600 px-6 py-1 rounded-full text-lg font-bold border border-slate-200 mb-8 uppercase tracking-widest">
                  {currentPlayer.category}
                </div>
                
                <div className="grid grid-cols-5 gap-4 w-full">
                  {[
                    { label: 'Matches', val: currentPlayer.stats?.matches },
                    { label: 'Runs', val: currentPlayer.stats?.runs },
                    { label: 'Wickets', val: currentPlayer.stats?.wickets },
                    { label: 'Avg', val: currentPlayer.stats?.average },
                    { label: 'S/R', val: currentPlayer.stats?.strikeRate }
                  ].map((s, i) => (
                    <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                      <div className="text-xs font-bold text-slate-400 uppercase mb-1">{s.label}</div>
                      <div className="text-2xl font-black text-slate-800">{formatStat(s.val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex-1 bg-white rounded-3xl p-8 border border-slate-200 shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
                <div 
                  className="w-52 h-52 rounded-full flex items-center justify-center border-8 border-white shadow-2xl transition-all duration-500"
                  style={{ backgroundColor: getTimerColor(), animation: timerValue <= 5 ? 'pulse 1s infinite' : 'none' }}
                >
                  <span className="text-8xl font-black text-white drop-shadow-md">{timerValue}</span>
                </div>

                <div className="mt-10 w-full bg-slate-50 rounded-3xl p-8 border border-slate-200 text-center shadow-inner">
                  <div className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Current Bid</div>
                  <div className="text-7xl font-black text-blue-600 mb-4 tracking-tighter">₹{currentBid.amount}</div>
                  <div className="flex items-center justify-center gap-4 bg-white py-3 px-6 rounded-2xl border border-slate-200 shadow-sm">
                    {currentBid.team && (
                      <img src={currentBid.team.logo ? `${SOCKET_URL}${currentBid.team.logo.replace(/^\/+/, '').startsWith('uploads') ? currentBid.team.logo.replace(/^\/+/, '') : 'uploads/' + currentBid.team.logo.replace(/^\/+/, '')}` : DEFAULT_TEAM_LOGO} className="w-12 h-12 rounded-full" alt={currentBid.team.teamName} onError={(e) => e.target.src = DEFAULT_TEAM_LOGO} />
                    )}
                    <div className="text-2xl font-bold text-slate-700 truncate">{currentBid.teamName}</div>
                  </div>
                </div>

                <div className="mt-6 text-xl font-bold text-slate-400">
                  BASE PRICE: <span className="text-slate-900 ml-2">₹{currentPlayer.basePrice}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 border-t border-slate-200">
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">Sold Gallery</div>
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
              {recentlySold.length > 0 ? recentlySold.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-slate-50 py-2 px-5 rounded-xl border border-slate-200 flex-shrink-0">
                  <span className="font-bold text-slate-700">{item.player?.name}</span>
                  <div className="h-4 w-[1px] bg-slate-300"></div>
                  <span className="text-blue-600 font-black">₹{item.amount}</span>
                  <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded-md">{item.team?.teamName}</span>
                </div>
              )) : <div className="text-slate-300 font-bold ml-2 italic">Awaiting first bid...</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full bg-slate-50">
          <div className="text-9xl animate-pulse mb-8 opacity-10">🏏</div>
          <h1 className="text-4xl font-black tracking-widest text-slate-300 uppercase">Auction Lobby</h1>
        </div>
      )}

      {showBidAnimation && bidAnimationData && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none">
          <div className="bg-blue-600 text-white rounded-3xl p-10 shadow-2xl animate-in zoom-in duration-300 flex flex-col items-center">
             <div className="text-xs font-black uppercase tracking-widest mb-4 opacity-70">New Bid Notification</div>
             <img src={bidAnimationData.teamLogo ? `${SOCKET_URL}${bidAnimationData.teamLogo.replace(/^\/+/, '').startsWith('uploads') ? bidAnimationData.teamLogo.replace(/^\/+/, '') : 'uploads/' + bidAnimationData.teamLogo.replace(/^\/+/, '')}` : DEFAULT_TEAM_LOGO} className="w-24 h-24 rounded-full border-4 border-white/20 mb-4" alt={bidAnimationData.teamName} onError={(e) => e.target.src = DEFAULT_TEAM_LOGO} />
             <div className="text-3xl font-black mb-1">{bidAnimationData.teamName}</div>
             <div className="text-6xl font-black">₹{bidAnimationData.amount} L</div>
          </div>
        </div>
      )}

      {showTeamSummary && (
        <div className="fixed inset-0 bg-slate-50 z-[999] flex flex-col p-8 animate-in fade-in duration-500">
          <div className="flex justify-between items-center mb-10 border-b border-slate-200 pb-6">
            <h1 className="text-5xl font-black tracking-tighter text-slate-900">SQUAD UPDATES</h1>
            <div className="bg-white border border-slate-200 px-6 py-2 rounded-2xl text-slate-500 font-bold shadow-sm">Reviewing Teams</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto no-scrollbar">
            {Array.isArray(teams) && teams.map((team) => (
              <div key={team._id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md">
                <div className="flex items-center gap-4 mb-6">
                  <img src={team.logo ? `${SOCKET_URL}${team.logo.replace(/^\/+/, '').startsWith('uploads') ? team.logo.replace(/^\/+/, '') : 'uploads/' + team.logo.replace(/^\/+/, '')}` : DEFAULT_TEAM_LOGO} className="w-16 h-16 rounded-full border border-slate-100 shadow-sm" alt={team.teamName} onError={(e) => e.target.src = DEFAULT_TEAM_LOGO} />
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">{team.teamName}</h2>
                    <div className="text-blue-600 font-bold">₹{team.purseBudget || 0} Purse</div>
                  </div>
                </div>
                <div className="space-y-2 mb-6 h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                  {Array(11).fill(null).map((_, i) => {
                    const p = team.players?.[i];
                    return (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-xl ${p ? 'bg-slate-50 border border-slate-100' : 'bg-slate-50 opacity-20 border border-dashed border-slate-300'}`}>
                        <span className="font-bold text-slate-700">{p ? p.name : `---`}</span>
                        {p && <span className="text-blue-600 font-black">₹{p.soldPrice}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="fixed bottom-0 left-0 right-0 h-2 bg-slate-200">
            <div className="h-full bg-blue-600 animate-[progressBar_10s_linear]"></div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes progressBar { from { width: 100%; } to { width: 0%; } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      `}</style>

      {/* Team Purse Bar - Fixed at bottom */}
      {!showSoldAnimation && !showTeamSummary && <TeamPurseBar teams={teams} socketUrl={SOCKET_URL} />}
    </div>
  );
}

export default App;