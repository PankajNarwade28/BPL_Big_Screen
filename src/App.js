import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import LoadingAnimation from "./LoadingAnimation";
import TeamPurseBar from "./TeamPurseBar";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000/";
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// Ensure SOCKET_URL ends with a slash
const normalizeUrl = (url) => (url.endsWith("/") ? url : url + "/");
const BASE_URL = normalizeUrl(SOCKET_URL);

const PLACEHOLDER_IMAGE =
  "https://res.cloudinary.com/dz8q0fb8m/image/upload/v1772197979/defaultPlayer_kad3xb.png";
const DEFAULT_TEAM_LOGO =
  "https://res.cloudinary.com/dz8q0fb8m/image/upload/v1772197980/defaultTeam_x7thxe.png";

const buildImgUrl = (path, base, placeholder) => {
  if (!path || path.trim() === "") return placeholder;

  // If it's a Cloudinary URL, return as-is (we'll optimize at usage points)
  if (path.startsWith("http")) return path;

  // Normalize base URL to ensure it has protocol and trailing slash
  let normalizedBase = base;
  if (!normalizedBase.startsWith("http")) {
    normalizedBase = "http://localhost:5000/";
  }
  normalizedBase = normalizedBase.endsWith("/")
    ? normalizedBase
    : normalizedBase + "/";

  // Clean the path - remove leading slashes
  const cleanPath = path.replace(/^\/+/, "");

  // Construct the full URL
  return `${normalizedBase}${cleanPath}`;
};

// Helper function to get optimized player photo
const getOptimizedPlayerPhoto = (photoUrl) => {
  if (!photoUrl) return PLACEHOLDER_IMAGE;

  // If it's already a full URL (Cloudinary or other), use it as-is
  if (photoUrl.startsWith("http")) {
    return photoUrl;
  }

  // For local uploads, use buildImgUrl
  return buildImgUrl(photoUrl, BASE_URL, PLACEHOLDER_IMAGE);
};

// Helper function to get optimized team logo
const getOptimizedTeamLogo = (logoUrl) => {
  if (!logoUrl) return DEFAULT_TEAM_LOGO;

  // If it's already a full URL (Cloudinary or other), use it as-is
  if (logoUrl.startsWith("http")) {
    return logoUrl;
  }

  // For local uploads, use buildImgUrl
  return buildImgUrl(logoUrl, BASE_URL, DEFAULT_TEAM_LOGO);
};

// Only return stats that have a real, non-zero value
const getVisibleStats = (stats) => {
  if (!stats) return [];
  return [
    { label: "Matches", val: stats.matches },
    { label: "Runs", val: stats.runs },
    { label: "Wickets", val: stats.wickets },
    { label: "Average", val: stats.average },
    { label: "Strike Rate", val: stats.strikeRate },
  ].filter(
    (s) => s.val !== undefined && s.val !== null && s.val !== "" && s.val !== 0,
  );
};

export default function App() {
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [timerValue, setTimerValue] = useState(20);
  const [currentBid, setCurrentBid] = useState({
    amount: 5,
    teamName: "No Bids Yet",
    team: null,
  });
  const [recentlySold, setRecentlySold] = useState([]);
  const [showSoldAnimation, setShowSoldAnimation] = useState(false);
  const [soldInfo, setSoldInfo] = useState(null);
  const soldAnimationTimeout = useRef(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [showBidAnimation, setShowBidAnimation] = useState(false);
  const [bidAnimationData, setBidAnimationData] = useState(null);
  const [showTeamSummary, setShowTeamSummary] = useState(false);
  const [teams, setTeams] = useState([]);

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
      } catch (e) {
        console.error(e);
      }
    };
    fetchTeams();
    const iv = setInterval(fetchTeams, 5000);
    return () => clearInterval(iv);
  }, []);

  /* ── socket ── */
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => {
      setTimeout(() => setIsConnecting(false), 1000);
      socket.emit("bigscreen:connect");
    });

    socket.on("auction:state", (data) => {
      if (!data.state) return;
      if (data.state.currentPlayer) {
        setCurrentPlayer(data.state.currentPlayer);
        setCurrentBid({
          amount: data.state.currentHighBid.amount,
          teamName: data.state.currentHighBid.team?.teamName || "No Bids Yet",
          team: data.state.currentHighBid.team || null,
        });
      } else setCurrentPlayer(null);
      if (data.state.recentlySold) setRecentlySold(data.state.recentlySold);
      setTimerValue(data.timerValue || 20);
    });

    socket.on("auction:started", (data) => {
      if (soldAnimationTimeout.current)
        clearTimeout(soldAnimationTimeout.current);
      setShowSoldAnimation(false);
      setCurrentPlayer(data.player);
      setCurrentBid({
        amount: data.basePrice,
        teamName: "Base Price",
        team: null,
      });
      setTimerValue(data.timerValue);
    });

    socket.on("bid:new", async (data) => {
      let teamData = data.team;
      if (!teamData && data.teamId) {
        try {
          const res = await fetch(`${API_URL}/teams`);
          if (res.ok) {
            const result = await res.json();
            teamData = (result.teams || result).find(
              (t) => t._id === data.teamId,
            );
          }
        } catch (e) {
          console.error(e);
        }
      }
      setCurrentBid({
        amount: data.amount,
        teamName: data.teamName,
        team: teamData || null,
      });
      if (teamData || data.teamName) {
        const purse = teamData?.remainingPoints || teamData?.purseBudget || 0;
        setBidAnimationData({
          teamName: data.teamName,
          teamLogo: teamData?.logo || "",
          amount: data.amount,
          remainingPurse: purse - data.amount,
        });
        setShowBidAnimation(true);
        setTimeout(() => setShowBidAnimation(false), 2500);
      }
    });

    socket.on("timer:update", (d) => setTimerValue(d.value));
    socket.on("timer:reset", (d) => setTimerValue(d.value));
    socket.on("teams:status", (d) => {
      if (d.teams && Array.isArray(d.teams)) setTeams(d.teams);
    });

    socket.on("auction:reset", (data) => {
      // Reset auction state
      setCurrentPlayer(null);
      setTimerValue(0);
      setShowSoldAnimation(false);
      setShowTeamSummary(false);

      console.log("Auction reset:", data.message);
    });

    socket.on("player:sold", (data) => {
      if (soldAnimationTimeout.current)
        clearTimeout(soldAnimationTimeout.current);
      setSoldInfo(data);
      setShowSoldAnimation(true);
      socket.emit("bigscreen:summaryStarting");
      const t = setTimeout(() => {
        setShowSoldAnimation(false);
        soldAnimationTimeout.current = null;
        setShowTeamSummary(true);
        setTimeout(() => {
          setShowTeamSummary(false);
          socket.emit("bigscreen:summaryComplete");
        }, 10000);
      }, 5000);
      soldAnimationTimeout.current = t;
      if (data.team) {
        setRecentlySold((prev) => [
          {
            player: data.player,
            team: data.team,
            amount: data.amount,
            soldAt: new Date(),
          },
          ...prev.slice(0, 9),
        ]);
      }
    });

    return () => {
      if (soldAnimationTimeout.current)
        clearTimeout(soldAnimationTimeout.current);
      socket.close();
    };
  }, []);

  /* ── timer colour ── */
  const timerRing =
    timerValue > 15
      ? "border-emerald-400 bg-emerald-50"
      : timerValue > 5
        ? "border-amber-400 bg-amber-50"
        : "border-red-400 bg-red-50";
  const timerText =
    timerValue > 15
      ? "text-emerald-600"
      : timerValue > 5
        ? "text-amber-600"
        : "text-red-600";

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
        <div
  className={`fixed inset-0 z-[1000] flex items-center justify-center p-4 transition-all duration-700 
  ${soldInfo.team ? "bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700" : "bg-gradient-to-br from-slate-600 to-slate-900"}`}
>
  <div className="anim-sold flex flex-col items-center w-full max-w-md text-center">
    {/* Dynamic Status Header */}
    <h1
      className={`font-black leading-none tracking-tighter mb-4 drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)]
      text-7xl sm:text-8xl md:text-9xl lg:text-[10rem]
      ${soldInfo.team ? "text-yellow-300 italic" : "text-slate-300"}`}
    >
      {soldInfo.team ? "SOLD!" : "UNSOLD"}
    </h1>

    {/* Main Card - Glass Effect */}
    <div className="w-full bg-white/95 backdrop-blur-md rounded-[2.5rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border-b-8 border-slate-200 p-6 sm:p-10">
      
      {/* Player Photo with Glow */}
      <div className="relative inline-block mb-6">
        <div className={`absolute inset-0 blur-2xl opacity-30 rounded-full ${soldInfo.team ? "bg-emerald-500" : "bg-slate-400"}`}></div>
        <img
          src={getOptimizedPlayerPhoto(soldInfo.player.photo)}
          onError={(e) => (e.target.src = PLACEHOLDER_IMAGE)}
          alt={soldInfo.player.name}
          className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-3xl object-cover border-4 border-white shadow-2xl mx-auto z-10"
        />
      </div>

      <h2 className="text-3xl sm:text-4xl font-black text-slate-800 mb-6 tracking-tight leading-tight">
        {soldInfo.player.name}
      </h2>

      {soldInfo.team && (
        <div className="flex items-center justify-center gap-4 bg-blue-50/80 border-2 border-blue-100 rounded-2xl px-5 py-4 mb-6 shadow-inner">
          <img
            src={getOptimizedTeamLogo(soldInfo.team.logo)}
            onError={(e) => (e.target.src = DEFAULT_TEAM_LOGO)}
            alt={soldInfo.team.teamName}
            className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md flex-shrink-0"
          />
          <div className="text-left leading-none">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Purchased By</p>
            <span className="text-xl sm:text-2xl font-black text-blue-800 truncate block max-w-[150px] sm:max-w-[200px]">
              {soldInfo.team.teamName}
            </span>
          </div>
        </div>
      )}

      {/* Price Tag */}
      <div className={`inline-flex items-center justify-center gap-2 rounded-2xl px-10 py-4 shadow-xl transform -rotate-1
        ${soldInfo.team ? "bg-emerald-600 text-white shadow-emerald-200" : "bg-slate-800 text-white shadow-slate-400"}`}>
        <span className="text-4xl sm:text-5xl font-black tabular-nums">
          ₹{soldInfo.amount}
        </span>
        <span className="text-sm font-bold opacity-80 uppercase mt-2 tracking-tighter">Points</span>
      </div>
    </div>
  </div>

  {/* Developer Credit */}
  <div className="fixed bottom-6 right-6 bg-black/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-[10px] text-white/80 font-bold uppercase tracking-widest z-[1001]">
    Dev: Pankaj Narwade
  </div>
</div>
      ) : /* ══════════════════════════════════════
          MAIN AUCTION VIEW
      ══════════════════════════════════════ */
      currentPlayer ? (
        <div className="flex flex-col h-full overflow-hidden relative">
          {/* Header */}
          <header className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm z-10">
            <div className="flex items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>
                  🏏
                </span>
                <span className="text-sm sm:text-base md:text-lg font-black tracking-widest text-slate-800 uppercase">
                  Cricket Auction
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 px-2.5 py-1 rounded-full">
                <span className="anim-live block w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                  Live
                </span>
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
                onError={(e) => (e.target.src = PLACEHOLDER_IMAGE)}
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
                <span
                  className="text-[9px] sm:text-[10px] md:text-xs font-bold tracking-widest uppercase
                                 bg-blue-50 text-blue-600 border border-blue-200
                                 px-2 sm:px-3 md:px-4 py-0.5 sm:py-1 rounded-full mb-2 sm:mb-3 md:mb-5"
                >
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
                      <div
                        key={i}
                        className="flex-1 min-w-[56px] max-w-[90px]
                                              bg-slate-50 border border-slate-200
                                              rounded-lg sm:rounded-xl p-1.5 sm:p-2 md:p-3 text-center"
                      >
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
            <div
              className="anim-up bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-md
                            flex flex-col items-center justify-center gap-2 sm:gap-3 md:gap-4 p-3 sm:p-4 md:p-6 overflow-hidden"
            >
              {/* Timer circle */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 rounded-full border-4 flex items-center justify-center
                                 transition-all duration-300 ${timerRing} ${timerValue <= 5 ? "anim-beat" : ""}`}
                >
                  <span
                    className={`text-3xl sm:text-5xl md:text-6xl font-black leading-none transition-colors duration-300 ${timerText}`}
                  >
                    {timerValue}
                  </span>
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  Seconds Left
                </p>
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-slate-100" />

              {/* Bid box */}
              <div className="w-full bg-blue-50 border border-blue-200 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 md:p-5 text-center">
                <p className="text-[9px] sm:text-[10px] font-bold tracking-widest text-blue-400 uppercase mb-1">
                  Current Bid
                </p>
                <p className="text-2xl sm:text-4xl md:text-5xl font-black text-blue-700 leading-none mb-2 sm:mb-3">
                  ₹{currentBid.amount}
                </p>

                {/* Team chip */}
                <div
                  className="inline-flex items-center gap-1.5 sm:gap-2 bg-white border border-slate-200
                                rounded-full pl-1 sm:pl-1.5 pr-2 sm:pr-4 py-0.5 sm:py-1 shadow-sm max-w-full overflow-hidden"
                >
                  {currentBid.team && (
                    <img
                      src={getOptimizedTeamLogo(currentBid.team.logo)}
                      onError={(e) => (e.target.src = DEFAULT_TEAM_LOGO)}
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
                Base Price:{" "}
                <span className="text-slate-700 font-bold">
                  ₹{currentPlayer.basePrice}
                </span>
              </p>
            </div>
          </main>

          {/* ── Sold Gallery footer ── */}
          <footer className="flex-shrink-0 bg-white border-t border-slate-200 px-2 py-1.5 sm:px-3 sm:py-2 md:px-4 md:py-3">
            <p className="text-[8px] sm:text-[9px] font-black tracking-widest text-slate-400 uppercase mb-1 sm:mb-2">
              Sold Gallery
            </p>
            <div className="no-sb flex gap-1.5 sm:gap-2 overflow-x-auto pb-1">
              {recentlySold.length > 0 ? (
                recentlySold.map((item, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2
                                          bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl px-2 sm:px-3 py-1 sm:py-2"
                  >
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
                <p className="text-[10px] sm:text-xs text-slate-300 italic px-1 py-1">
                  Awaiting first sale…
                </p>
              )}
            </div>
          </footer>
        </div>
      ) : (
        /* ══════════════════════════════════════
          LOBBY / WAITING SCREEN
      ══════════════════════════════════════ */
        <div
          className="flex flex-col items-center justify-center h-full gap-4
                        bg-gradient-to-b from-slate-50 to-slate-100 px-4"
        >
          <span
            className="text-7xl sm:text-8xl opacity-10 select-none"
            aria-hidden
          >
            🏏
          </span>
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
      BID NOTIFICATION TOAST (CENTERED & RESPONSIVE)
    ══════════════════════════════════════ */}
      {showBidAnimation && bidAnimationData && (
        <div className="fixed inset-0 flex items-center justify-center p-6 z-[9999] pointer-events-none">
          <div
            className="anim-bid w-full max-w-sm md:max-w-xl 
                 bg-slate-900/90 backdrop-blur-xl border border-white/20
                 rounded-[2rem] md:rounded-[3rem] shadow-[0_0_50px_rgba(37,99,235,0.3)] 
                 px-6 py-5 md:px-10 md:py-8 flex items-center gap-6 md:gap-10
                 relative overflow-hidden"
          >
            {/* Background Animated Glow */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-shimmer" />

            {/* Team Logo with Pulse */}
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-blue-500 rounded-full blur-md animate-ping opacity-20" />
              <img
                src={
                  bidAnimationData.teamLogo
                    ? getOptimizedTeamLogo(bidAnimationData.teamLogo)
                    : DEFAULT_TEAM_LOGO
                }
                onError={(e) => (e.target.src = DEFAULT_TEAM_LOGO)}
                alt={bidAnimationData.teamName}
                className="w-16 h-16 md:w-28 md:h-28 rounded-full object-cover 
                     border-4 border-white/10 shadow-xl relative z-10"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <p className="text-[10px] md:text-sm font-black tracking-[0.3em] text-blue-400 uppercase">
                  New Lead Bid
                </p>
              </div>

              <p className="text-xl md:text-4xl font-black text-white truncate leading-tight uppercase italic tracking-tight">
                {bidAnimationData.teamName}
              </p>

              <div className="flex items-baseline gap-1 md:gap-2 mt-1">
                <span className="text-xl md:text-3xl font-bold text-blue-500">
                  ₹
                </span>
                <p className="text-4xl md:text-7xl font-black text-white leading-none tracking-tighter animate-pulse">
                  {bidAnimationData.amount}
                </p>
              </div>
            </div>

            {/* Aesthetic "Tech" Accents */}
            <div className="hidden md:block absolute right-6 top-1/2 -translate-y-1/2 rotate-90 opacity-20">
              <p className="text-[10px] font-black tracking-[1em] text-white">
                AUCTION
              </p>
            </div>
          </div>

          {/* Custom Animations */}
          <style>{`
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      .animate-shimmer {
        animation: shimmer 1.5s infinite;
      }
      .anim-bid {
        animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      @keyframes popIn {
        0% { opacity: 0; transform: scale(0.8) translateY(20px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
    `}</style>
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
          <div
            className="flex-shrink-0 flex items-center justify-between
                          px-2 py-2 sm:px-6 sm:py-4 bg-white border-b border-slate-200 shadow-sm"
          >
            <h1 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight text-slate-900">
              Squad Updates
            </h1>
            <div
              className="flex items-center gap-1.5 bg-blue-50 border border-blue-200
                            text-blue-600 px-3 py-1.5 rounded-full"
            >
              <span className="anim-live block w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[10px] font-bold tracking-widest uppercase">
                Reviewing
              </span>
            </div>
          </div>

          {/* Teams grid */}
          <div className="no-sb flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {Array.isArray(teams) &&
                teams.map((team) => (
                  <div
                    key={team._id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                  >
                    {/* Team header */}
                    <div className="flex items-center gap-3 p-4 border-b border-slate-100">
                      <img
                        src={getOptimizedTeamLogo(team.logo)}
                        onError={(e) => (e.target.src = DEFAULT_TEAM_LOGO)}
                        alt={team.teamName}
                        className="w-11 h-11 rounded-full object-cover border border-slate-200 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-black text-slate-800 text-base leading-tight truncate">
                          {team.teamName}
                        </p>
                        <p className="hidden sm:block text-sm font-bold text-blue-600">
                          ₹{team.purseBudget || 0} Purse
                        </p>
                      </div>
                    </div>

                    {/* Player slots */}
                    <div className="thin-sb p-3 max-h-64 lg:max-h-none overflow-y-auto lg:overflow-visible space-y-1.5">
                      {Array(11)
                        .fill(null)
                        .map((_, i) => {
                          const p = team.players?.[i];
                          return (
                            <div
                              key={i}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm
          ${
            p
              ? "bg-blue-50 border border-blue-100"
              : "bg-slate-50 border border-dashed border-slate-200 opacity-40"
          }`}
                            >
                              <span
                                className={`font-semibold truncate ${p ? "text-black-700" : "text-slate-400"}`}
                              >
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

      {/* ══════════════════════════════════════
      WAITING / IDLE SCREEN (when no auction active)
      ══════════════════════════════════════ */}
{!showSoldAnimation &&
  !showTeamSummary &&
  !isConnecting &&
  !currentPlayer && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617] overflow-hidden font-sans p-5">
      {/* 1. DYNAMIC BACKGROUND BEAMS */}
      <div className="absolute inset-0">
        <div className="stadium-light absolute top-[-5%] left-[-5%] w-[60vw] h-[60vw] bg-blue-600/10 rounded-full blur-[100px] animate-pulse" />
        <div
          className="stadium-light absolute bottom-[-5%] right-[-5%] w-[60vw] h-[60vw] bg-purple-600/10 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: "2s" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_49%,rgba(99,102,241,0.05)_50%,transparent_51%)] bg-[length:100%_4px] animate-scan" />
      </div>

      {/* 2. MAIN CONTENT CARD */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[400px]">
        
        {/* Visual Focus: GIF Frame (Scaled down to 100px/80px) */}
        <div className="relative mb-8">
          <div className="absolute -inset-4 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full opacity-20 blur-xl animate-pulse" />
          
          <div className="image-frame relative w-[100px] h-[100px] rounded-full overflow-hidden border-2 border-white/20 shadow-2xl bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-10">
            <img
              src="/assets/Untitled file.gif"
              alt="Cricket Animation"
              className="w-full h-full object-cover mix-blend-lighten scale-110"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          </div>

          {/* Animated Tech Accents */}
          <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-blue-400 rounded-tl-lg" />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-purple-400 rounded-br-lg" />
        </div>

        {/* 3. BRANDING & STATUS */}
        <div className="text-center w-full">
          <div className="mb-6">
            <h1 className="brand-title text-5xl font-black text-white tracking-tighter uppercase italic leading-none mb-2">
              Bittargon
            </h1>
            <p className="text-[11px] sm:text-xs font-bold tracking-[0.4em] text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 uppercase">
              Cricket Association
            </p>
          </div>

          {/* Status Box */}
          <div className="inline-flex flex-col items-center gap-3 py-4 px-6 w-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <p className="text-sm sm:text-lg font-bold text-blue-100 italic tracking-widest">
                WAIT FOR NEXT PLAYER
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 animate-loading-bar" />
            </div>

            <p className="text-[9px] font-black tracking-[0.3em] text-white/40 uppercase">
              Auction Engine Standby
            </p>
          </div>
        </div>

        {/* 4. FOOTER STATS */}
        <div className="grid grid-cols-3 gap-2 border-t border-white/5 mt-8 pt-6 w-full">
          <div className="text-center">
            <p className="text-white/20 text-[8px] font-bold uppercase">Status</p>
            <p className="text-green-400 text-[10px] font-black">LIVE</p>
          </div>
          <div className="text-center">
            <p className="text-white/20 text-[8px] font-bold uppercase">Feed</p>
            <p className="text-white/70 text-[10px] font-black">SYNCED</p>
          </div>
          <div className="text-center">
            <p className="text-white/20 text-[8px] font-bold uppercase">Bidding</p>
            <p className="text-white/70 text-[10px] font-black">ACTIVE</p>
          </div>
        </div>
      </div>

      {/* 5. DEVELOPER SIGNATURE */}
      <div className="absolute bottom-6 text-center w-full left-0 px-4">
        <span className="text-[9px] text-white/20 font-bold tracking-[0.2em] uppercase">
          DEVELOPED BY 
          <span className="text-blue-500/50 ml-2">PANKAJ NARWADE PATIL</span>
        </span>
      </div>

      <style jsx>{`
        @keyframes scan {
          0% { background-position: 0 0; }
          100% { background-position: 0 100%; }
        }
        .animate-scan {
          animation: scan 10s linear infinite;
        }
        @keyframes loading-bar {
          0% { width: 0%; transform: translateX(0%); }
          50% { width: 100%; transform: translateX(0%); }
          100% { width: 0%; transform: translateX(100%); }
        }
        .animate-loading-bar {
          animation: loading-bar 2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }

        /* Responsive Adjustments */
        @media (max-width: 480px) {
          .image-frame {
            width: 80px !important;
            height: 80px !important;
          }
          .brand-title {
            font-size: 2.5rem !important;
          }
          .stadium-light {
            width: 90vw !important;
            height: 90vw !important;
          }
        }
      `}</style>
    </div>
  )}

      {/* Team Purse Bar - Hidden on mobile */}
      {!showSoldAnimation && !showTeamSummary && currentPlayer && (
        <div className="hidden md:block">
          <TeamPurseBar teams={teams} socketUrl={SOCKET_URL} />
        </div>
      )}
    </div>
  );
}
