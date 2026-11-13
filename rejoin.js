// --- REJOIN MODULE (rejoin.js) ---

window.onload = function() {
  const savedRoom = localStorage.getItem('zaman_mp_room');
  const savedPlayer = localStorage.getItem('zaman_mp_player');
  if(savedRoom && savedPlayer) {
    const rejoinBtn = document.getElementById('rejoinBtn');
    if(rejoinBtn) rejoinBtn.classList.remove('hidden');
  }
};

function autoRejoin() {
  const roomId = localStorage.getItem('zaman_mp_room');
  const playerId = localStorage.getItem('zaman_mp_player');
  if(!roomId || !playerId) return;

  const roomRef = db.ref("rooms/" + roomId);
  roomRef.once("value", snap => {
    if(!snap.exists()) {
      alert("റൂം ഇപ്പോൾ നിലവിലില്ല!");
      localStorage.clear();
      location.reload();
      return;
    }
    const data = snap.val();
    if(data.players && data.players[playerId]) {
      window.roomId = roomId;
      window.playerId = playerId;
      window.roomRef = roomRef;
      window.playerName = data.players[playerId].name;
      window.myRole = data.players[playerId].role;
      
      if(typeof setupRoomListeners === 'function') {
        setupRoomListeners();
      }
    } else {
      alert("പ്ലെയറെ കണ്ടെത്താൻ കഴിഞ്ഞില്ല");
      localStorage.clear();
      location.reload();
    }
  });
}

function quitGame() {
  localStorage.removeItem('zaman_mp_room');
  localStorage.removeItem('zaman_mp_player');
  location.reload();
}
