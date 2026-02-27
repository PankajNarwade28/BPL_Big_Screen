import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import LoadingAnimation from './LoadingAnimation';
import TeamPurseBar from './TeamPurseBar';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000/';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Ensure SOCKET_URL ends with a slash
const normalizeUrl = (url) => url.endsWith('/') ? url : url + '/';
const BASE_URL = normalizeUrl(SOCKET_URL);

const PLACEHOLDER_IMAGE = 'https://res.cloudinary.com/dz8q0fb8m/image/upload/v1772197979/defaultPlayer_kad3xb.png';
const DEFAULT_TEAM_LOGO = 'https://res.cloudinary.com/dz8q0fb8m/image/upload/v1772197980/defaultTeam_x7thxe.png';

const buildImgUrl = (path, base, placeholder) => {
  if (!path || path.trim() === '') return placeholder;
  
  // If it's a Cloudinary URL, return as-is (we'll optimize at usage points)
  if (path.startsWith('http')) return path;
  
  // Normalize base URL to ensure it has protocol and trailing slash
  let normalizedBase = base;
  if (!normalizedBase.startsWith('http')) {
    normalizedBase = 'http://localhost:5000/';
  }
  normalizedBase = normalizedBase.endsWith('/') ? normalizedBase : normalizedBase + '/';
  
  // Clean the path - remove leading slashes
  const cleanPath = path.replace(/^\/+/, '');
  
  // Construct the full URL
  return `${normalizedBase}${cleanPath}`;
};

// Helper function to get optimized player photo
const getOptimizedPlayerPhoto = (photoUrl) => {
  if (!photoUrl) return PLACEHOLDER_IMAGE;
  
  // If it's already a full URL (Cloudinary or other), use it as-is
  if (photoUrl.startsWith('http')) {
    return photoUrl;
  }
  
  // For local uploads, use buildImgUrl
  return buildImgUrl(photoUrl, BASE_URL, PLACEHOLDER_IMAGE);
};

// Helper function to get optimized team logo
const getOptimizedTeamLogo = (logoUrl) => {
  if (!logoUrl) return DEFAULT_TEAM_LOGO;
  
  // If it's already a full URL (Cloudinary or other), use it as-is
  if (logoUrl.startsWith('http')) {
    return logoUrl;
  }
  
  // For local uploads, use buildImgUrl
  return buildImgUrl(logoUrl, BASE_URL, DEFAULT_TEAM_LOGO);
};

// Only return stats that have a real, non-zero value
const getVisibleStats = (stats) => {
  if (!stats) return [];
  return [
    { label: 'Matches',      val: stats.matches    },
    { label: 'Runs',         val: stats.runs       },
    { label: 'Wickets',      val: stats.wickets    },
    { label: 'Average',      val: stats.average    },
    { label: 'Strike Rate',  val: stats.strikeRate },
  ].filter(s => s.val !== undefined && s.val !== null && s.val !== '' && s.val !== 0);
};

export default function App() {
  const [currentPlayer,     setCurrentPlayer]     = useState(null);
  const [timerValue,        setTimerValue]         = useState(20);
  const [currentBid,        setCurrentBid]         = useState({ amount: 5, teamName: 'No Bids Yet', team: null });
  const [recentlySold,      setRecentlySold]       = useState([]);
  const [showSoldAnimation, setShowSoldAnimation]  = useState(false);
  const [soldInfo,          setSoldInfo]            = useState(null);
  const soldAnimationTimeout                        = useRef(null);
  const [isConnecting,      setIsConnecting]        = useState(true);
  const [showBidAnimation,  setShowBidAnimation]    = useState(false);
  const [bidAnimationData,  setBidAnimationData]    = useState(null);
  const [showTeamSummary,   setShowTeamSummary]     = useState(false);
  const [teams,             setTeams]               = useState([]);

  /* ── fetch teams ── */
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await fetch(`${API_URL}/teams`);
        if (res.ok) {
          const data = await res.json();
          if (data.teams && Array.isArray(data.teams)) setTeams(data.teams);
          else if (Array.isArray(data)) setTeams(data);
        }
      } catch (e) { console.error(e); }
    };
    fetchTeams();
    const iv = setInterval(fetchTeams, 5000);
    return () => clearInterval(iv);
  }, []);

  /* ── socket ── */
  useEffect(() => {
    const socket = io(SOCKET_URL, { reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 10 });

    socket.on('connect', () => {
      setTimeout(() => setIsConnecting(false), 1000);
      socket.emit('bigscreen:connect');
    });

    socket.on('auction:state', (data) => {
      if (!data.state) return;
      if (data.state.currentPlayer) {
        setCurrentPlayer(data.state.currentPlayer);
        setCurrentBid({
          amount:   data.state.currentHighBid.amount,
          teamName: data.state.currentHighBid.team?.teamName || 'No Bids Yet',
          team:     data.state.currentHighBid.team || null,
        });
      } else setCurrentPlayer(null);
      if (data.state.recentlySold) setRecentlySold(data.state.recentlySold);
      setTimerValue(data.timerValue || 20);
    });

    socket.on('auction:started', (data) => {
      if (soldAnimationTimeout.current) clearTimeout(soldAnimationTimeout.current);
      setShowSoldAnimation(false);
      setCurrentPlayer(data.player);
      setCurrentBid({ amount: data.basePrice, teamName: 'Base Price', team: null });
      setTimerValue(data.timerValue);
    });

    socket.on('bid:new', async (data) => {
      let teamData = data.team;
      if (!teamData && data.teamId) {
        try {
          const res = await fetch(`${API_URL}/teams`);
          if (res.ok) {
            const result = await res.json();
            teamData = (result.teams || result).find(t => t._id === data.teamId);
          }
        } catch (e) { console.error(e); }
      }
      setCurrentBid({ amount: data.amount, teamName: data.teamName, team: teamData || null });
      if (teamData || data.teamName) {
        const purse = teamData?.remainingPoints || teamData?.purseBudget || 0;
        setBidAnimationData({
          teamName:      data.teamName,
          teamLogo:      teamData?.logo || '',
          amount:        data.amount,
          remainingPurse: purse - data.amount,
        });
        setShowBidAnimation(true);
        setTimeout(() => setShowBidAnimation(false), 2500);
      }
    });

    socket.on('timer:update', (d) => setTimerValue(d.value));
    socket.on('timer:reset',  (d) => setTimerValue(d.value));
    socket.on('teams:status', (d) => { if (d.teams && Array.isArray(d.teams)) setTeams(d.teams); });

    socket.on('auction:reset', (data) => {
      // Reset auction state
      setCurrentPlayer(null);
      setTimerValue(0);
      setShowSoldAnimation(false);
      setShowTeamSummary(false);
      
      console.log('Auction reset:', data.message);
    });

    socket.on('player:sold', (data) => {
      if (soldAnimationTimeout.current) clearTimeout(soldAnimationTimeout.current);
      setSoldInfo(data);
      setShowSoldAnimation(true);
      socket.emit('bigscreen:summaryStarting');
      const t = setTimeout(() => {
        setShowSoldAnimation(false);
        soldAnimationTimeout.current = null;
        setShowTeamSummary(true);
        setTimeout(() => { setShowTeamSummary(false); socket.emit('bigscreen:summaryComplete'); }, 10000);
      }, 5000);
      soldAnimationTimeout.current = t;
      if (data.team) {
        setRecentlySold(prev => [
          { player: data.player, team: data.team, amount: data.amount, soldAt: new Date() },
          ...prev.slice(0, 9),
        ]);
      }
    });

    return () => {
      if (soldAnimationTimeout.current) clearTimeout(soldAnimationTimeout.current);
      socket.close();
    };
  }, []);

  /* ── timer colour ── */
  const timerRing = timerValue > 15 ? 'border-emerald-400 bg-emerald-50' : timerValue > 5 ? 'border-amber-400 bg-amber-50' : 'border-red-400 bg-red-50';
  const timerText = timerValue > 15 ? 'text-emerald-600' : timerValue > 5 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="h-screen min-h-screen overflow-hidden flex flex-col bg-slate-50 text-slate-900">

      {/* Animation keyframes — only motion, no layout/colour */}
      <style>{`
        @keyframes sold-slam { 0%{transform:scale(.65) translateY(20px);opacity:0} 65%{transform:scale(1.04) translateY(-4px);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes bid-pop   { 0%{transform:translateY(64px) scale(.9);opacity:0} 60%{transform:translateY(-5px) scale(1.02);opacity:1} 100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes fade-up   { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes beat      { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
        @keyframes prog      { from{width:100%} to{width:0%} }
        .anim-sold { animation: sold-slam .55s cubic-bezier(.34,1.4,.64,1) forwards }
        .anim-bid  { animation: bid-pop   .45s cubic-bezier(.34,1.4,.64,1) forwards }
        .anim-up   { animation: fade-up   .4s ease forwards }
        .anim-live { animation: blink 1.4s ease infinite }
        .anim-beat { animation: beat  .65s ease infinite }
        .anim-prog { animation: prog  10s linear forwards }
        .no-sb::-webkit-scrollbar            { display:none }
        .no-sb                               { scrollbar-width:none; -ms-overflow-style:none }
        .thin-sb::-webkit-scrollbar          { width:3px }
        .thin-sb::-webkit-scrollbar-thumb    { background:#CBD5E1; border-radius:6px }
        .thin-sb::-webkit-scrollbar-track    { background:transparent }
      `}</style>

      {isConnecting && <LoadingAnimation message="Establishing Connection…" />}

      {/* ══════════════════════════════════════
          SOLD / UNSOLD SCREEN
      ══════════════════════════════════════ */}
      {showSoldAnimation && soldInfo ? (
        <div className={`fixed inset-0 z-[1000] flex items-center justify-center p-4 ${soldInfo.team ? 'bg-emerald-50' : 'bg-slate-100'}`}>
          <div className="anim-sold flex flex-col items-center w-full max-w-md text-center">

            <h1 className={`font-black leading-none tracking-tight mb-5
              text-6xl sm:text-8xl md:text-9xl
              ${soldInfo.team ? 'text-emerald-500' : 'text-slate-400'}`}>
              {soldInfo.team ? 'SOLD!' : 'UNSOLD'}
            </h1>

            <div className="w-full bg-white rounded-3xl border border-slate-200 shadow-2xl p-5 sm:p-8">
              <img
                src={getOptimizedPlayerPhoto(soldInfo.player.photo)}
                onError={e => e.target.src = PLACEHOLDER_IMAGE}
                alt={soldInfo.player.name}
                className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl object-cover border-2 border-slate-100 shadow-md mx-auto mb-4"
              />
              <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mb-4 leading-tight">
                {soldInfo.player.name}
              </h2>

              {soldInfo.team && (
                <div className="flex items-center justify-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-4">
                  <img
                    src={getOptimizedTeamLogo(soldInfo.team.logo)}
                    onError={e => e.target.src = DEFAULT_TEAM_LOGO}
                    alt={soldInfo.team.teamName}
                    className="w-10 h-10 rounded-full object-cover border border-slate-200 flex-shrink-0"
                  />
                  <span className="text-lg sm:text-xl font-black text-blue-700 truncate">
                    {soldInfo.team.teamName}
                  </span>
                </div>
              )}

              <div className="inline-block bg-blue-600 text-white rounded-2xl px-8 py-4">
                <span className="text-3xl sm:text-4xl font-black">₹{soldInfo.amount}</span>
                <span className="text-sm font-medium opacity-70 ml-2">Pts</span>
              </div>
            </div>
          </div>
          
          {/* Developer Credit */}
          <div className="fixed bottom-4 right-4 text-[10px] text-slate-400 font-medium opacity-40 z-[1001]">
            Developed By Pankaj Narwade
          </div>
        </div>

      /* ══════════════════════════════════════
          MAIN AUCTION VIEW
      ══════════════════════════════════════ */
      ) : currentPlayer ? (
        <div className="flex flex-col h-full overflow-hidden relative">

          {/* Header */}
          <header className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm z-10">
            <div className="flex items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>🏏</span>
                <span className="text-sm sm:text-base md:text-lg font-black tracking-widest text-slate-800 uppercase">
                  Cricket Auction
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 px-2.5 py-1 rounded-full">
                <span className="anim-live block w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-[10px] sm:text-xs font-bold tracking-widest uppercase">Live</span>
              </div>
            </div>
          </header>

          {/* Body — stacks vertically on mobile, side-by-side on lg+ */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-2 p-2 sm:gap-3 sm:p-3 md:gap-4 md:p-4">

            {/* ── Player Card ── */}
            <div className="anim-up bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-md flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 overflow-auto no-sb">

              {/* Photo */}
              <img
                src={getOptimizedPlayerPhoto(currentPlayer.photo)}
                onError={e => e.target.src = PLACEHOLDER_IMAGE}
                alt={currentPlayer.name}
                className="w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 lg:w-44 lg:h-44 rounded-xl sm:rounded-2xl object-cover
                           border-2 border-slate-100 shadow-lg mb-2 sm:mb-3 md:mb-4 flex-shrink-0"
              />

              {/* Name */}
              <h2 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 text-center leading-tight mb-1 sm:mb-2">
                {currentPlayer.name}
              </h2>

              {/* Category */}
              {currentPlayer.category && (
                <span className="text-[9px] sm:text-[10px] md:text-xs font-bold tracking-widest uppercase
                                 bg-blue-50 text-blue-600 border border-blue-200
                                 px-2 sm:px-3 md:px-4 py-0.5 sm:py-1 rounded-full mb-2 sm:mb-3 md:mb-5">
                  {currentPlayer.category}
                </span>
              )}

              {/* Stats — only rendered when ≥1 stat exists */}
              {(() => {
                const stats = getVisibleStats(currentPlayer.stats);
                if (stats.length === 0) return null;
                return (
                  <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 w-full">
                    {stats.map((s, i) => (
                      <div key={i} className="flex-1 min-w-[56px] max-w-[90px]
                                              bg-slate-50 border border-slate-200
                                              rounded-lg sm:rounded-xl p-1.5 sm:p-2 md:p-3 text-center">
                        <p className="text-[8px] sm:text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">
                          {s.label}
                        </p>
                        <p className="text-xs sm:text-sm md:text-xl lg:text-2xl font-black text-slate-800 leading-none">
                          {s.val}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* ── Timer + Bid ── */}
            <div className="anim-up bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-md
                            flex flex-col items-center justify-center gap-2 sm:gap-3 md:gap-4 p-3 sm:p-4 md:p-6 overflow-hidden">

              {/* Timer circle */}
              <div className="flex flex-col items-center gap-1">
                <div className={`w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 rounded-full border-4 flex items-center justify-center
                                 transition-all duration-300 ${timerRing} ${timerValue <= 5 ? 'anim-beat' : ''}`}>
                  <span className={`text-3xl sm:text-5xl md:text-6xl font-black leading-none transition-colors duration-300 ${timerText}`}>
                    {timerValue}
                  </span>
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold tracking-widest text-slate-400 uppercase">Seconds Left</p>
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-slate-100" />

              {/* Bid box */}
              <div className="w-full bg-blue-50 border border-blue-200 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 md:p-5 text-center">
                <p className="text-[9px] sm:text-[10px] font-bold tracking-widest text-blue-400 uppercase mb-1">Current Bid</p>
                <p className="text-2xl sm:text-4xl md:text-5xl font-black text-blue-700 leading-none mb-2 sm:mb-3">
                  ₹{currentBid.amount}
                </p>

                {/* Team chip */}
                <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-white border border-slate-200
                                rounded-full pl-1 sm:pl-1.5 pr-2 sm:pr-4 py-0.5 sm:py-1 shadow-sm max-w-full overflow-hidden">
                  {currentBid.team && (
                    <img
                      src={getOptimizedTeamLogo(currentBid.team.logo)}
                      onError={e => e.target.src = DEFAULT_TEAM_LOGO}
                      alt={currentBid.team.teamName}
                      className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 rounded-full object-cover border border-slate-200 flex-shrink-0"
                    />
                  )}
                  <span className="text-xs sm:text-sm font-bold text-slate-700 truncate max-w-[120px] sm:max-w-[180px]">
                    {currentBid.teamName}
                  </span>
                </div>
              </div>

              {/* Base price */}
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium">
                Base Price: <span className="text-slate-700 font-bold">₹{currentPlayer.basePrice}</span>
              </p>
            </div>
          </main>

          {/* ── Sold Gallery footer ── */}
          <footer className="flex-shrink-0 bg-white border-t border-slate-200 px-2 py-1.5 sm:px-3 sm:py-2 md:px-4 md:py-3">
            <p className="text-[8px] sm:text-[9px] font-black tracking-widest text-slate-400 uppercase mb-1 sm:mb-2">Sold Gallery</p>
            <div className="no-sb flex gap-1.5 sm:gap-2 overflow-x-auto pb-1">
              {recentlySold.length > 0 ? (
                recentlySold.map((item, i) => (
                  <div key={i} className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2
                                          bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl px-2 sm:px-3 py-1 sm:py-2">
                    <span className="text-[10px] sm:text-xs md:text-sm font-semibold text-slate-700 whitespace-nowrap">
                      {item.player?.name}
                    </span>
                    <div className="w-px h-2.5 sm:h-3 bg-slate-300" />
                    <span className="text-[10px] sm:text-xs md:text-sm font-black text-blue-600 whitespace-nowrap">
                      ₹{item.amount}
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-bold bg-slate-200 text-slate-500 px-1.5 sm:px-2 py-0.5 rounded-md whitespace-nowrap">
                      {item.team?.teamName}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] sm:text-xs text-slate-300 italic px-1 py-1">Awaiting first sale…</p>
              )}
            </div>
          </footer>
        </div>

      /* ══════════════════════════════════════
          LOBBY / WAITING SCREEN
      ══════════════════════════════════════ */
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4
                        bg-gradient-to-b from-slate-50 to-slate-100 px-4">
          <span className="text-7xl sm:text-8xl opacity-10 select-none" aria-hidden>🏏</span>
          <h1 className="text-lg sm:text-2xl font-black tracking-widest text-slate-300 uppercase text-center">
            Auction Lobby
          </h1>
          <div className="flex items-center gap-2">
            <span className="anim-live block w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] sm:text-xs font-bold tracking-widest text-slate-400 uppercase">
              Developed By Pankaj Narwade Patil
            </span>
          </div>
          {/* Developer Credit */}
          <div className="absolute bottom-4 right-4 text-[10px] text-slate-300 font-medium opacity-50">
            Developed By Pankaj Narwade
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          BID NOTIFICATION TOAST
      ══════════════════════════════════════ */}
      {showBidAnimation && bidAnimationData && (
        <div className="fixed inset-0 flex items-end justify-center p-4 z-[9999] pointer-events-none">
          <div className="anim-bid w-full max-w-sm bg-white border border-slate-200
                          rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4">
            <img
              src={bidAnimationData.teamLogo
                ? getOptimizedTeamLogo(bidAnimationData.teamLogo)
                : DEFAULT_TEAM_LOGO}
              onError={e => e.target.src = DEFAULT_TEAM_LOGO}
              alt={bidAnimationData.teamName}
              className="w-14 h-14 rounded-full object-cover border-2 border-slate-200 flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-widest text-blue-500 uppercase mb-0.5">New Bid</p>
              <p className="text-base font-black text-slate-800 truncate">{bidAnimationData.teamName}</p>
              <p className="text-2xl font-black text-blue-600 leading-none">₹{bidAnimationData.amount}</p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          TEAM SUMMARY SCREEN
      ══════════════════════════════════════ */}
      {showTeamSummary && (
        <div className="fixed inset-0 bg-slate-50 z-[999] flex flex-col overflow-hidden">

          {/* Developer Credit */}
          <div className="fixed bottom-3 right-4 text-[9px] sm:text-[10px] text-slate-400 font-medium opacity-40 z-[1000]">
            Developed By Pankaj Narwade
          </div>

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between
                          px-4 py-3 sm:px-6 sm:py-4 bg-white border-b border-slate-200 shadow-sm">
            <h1 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight text-slate-900">
              Squad Updates
            </h1>
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200
                            text-blue-600 px-3 py-1.5 rounded-full">
              <span className="anim-live block w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[10px] font-bold tracking-widest uppercase">Reviewing</span>
            </div>
          </div>

          {/* Teams grid */}
          <div className="no-sb flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {Array.isArray(teams) && teams.map(team => (
                <div key={team._id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                  {/* Team header */}
                  <div className="flex items-center gap-3 p-4 border-b border-slate-100">
                    <img
                      src={getOptimizedTeamLogo(team.logo)}
                      onError={e => e.target.src = DEFAULT_TEAM_LOGO}
                      alt={team.teamName}
                      className="w-11 h-11 rounded-full object-cover border border-slate-200 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 text-base leading-tight truncate">
                        {team.teamName}
                      </p>
                      <p className="hidden sm:block text-sm font-bold text-blue-600">₹{team.purseBudget || 0} Purse</p>
                    </div>
                  </div>

                  {/* Player slots */}
                  <div className="thin-sb p-3 max-h-64 overflow-y-auto space-y-1.5">
                    {Array(11).fill(null).map((_, i) => {
                      const p = team.players?.[i];
                      return (
                        <div key={i}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm
                            ${p
                              ? 'bg-blue-50 border border-blue-100'
                              : 'bg-slate-50 border border-dashed border-slate-200 opacity-40'}`}>
                          <span className={`font-semibold truncate ${p ? 'text-black-700' : 'text-slate-400'}`}>
                            {p ? p.name : `Slot ${i + 1}`}
                          </span>
                          {p && (
                            <span className="font-black text-blue-600 ml-2 flex-shrink-0">
                              ₹{p.soldPrice}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex-shrink-0 h-1 bg-slate-200">
            <div className="anim-prog h-full bg-blue-500 rounded-full" />
          </div>
        </div>
      )}

      {/* Team Purse Bar - Hidden on mobile */}
      {!showSoldAnimation && !showTeamSummary && (
        <div className="hidden md:block">
          <TeamPurseBar teams={teams} socketUrl={SOCKET_URL} />
        </div>
      )}
    </div>
  );
}
