const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

const wordList = [
  { category: "음식", word: "떡볶이" },
  { category: "음식", word: "치킨" },
  { category: "음식", word: "삼겹살" },
  { category: "동물", word: "호랑이" },
  { category: "동물", word: "강아지" },
  { category: "장소", word: "놀이공원" },
  { category: "장소", word: "영화관" }
];

io.on('connection', (socket) => {
  socket.on('createRoom', ({ nickname }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[roomId] = {
      hostId: socket.id, // 방장 ID 저장
      players: [{ id: socket.id, nickname }],
      state: 'waiting',
      wordObj: null,
      liarId: null
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, nickname, isHost: true });
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('errorMsg', '존재하지 않는 방입니다.');
    if (room.players.length >= 6) return socket.emit('errorMsg', '방이 꽉 찼습니다. (최대 6명)');
    if (room.state === 'playing') return socket.emit('errorMsg', '이미 게임이 진행 중입니다.');

    room.players.push({ id: socket.id, nickname });
    socket.join(roomId);
    socket.emit('joinedRoom', { roomId, nickname, isHost: false });
    io.to(roomId).emit('updatePlayers', room.players);
  });

  // 게임 시작
  socket.on('startGame', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players.length < 2) return socket.emit('errorMsg', '최소 2명 이상이어야 합니다.');

    room.state = 'playing';
    room.wordObj = wordList[Math.floor(Math.random() * wordList.length)];
    const liarIndex = Math.floor(Math.random() * room.players.length);
    room.liarId = room.players[liarIndex].id;

    room.players.forEach(player => {
      io.to(player.id).emit('gameStarted', {
        isLiar: player.id === room.liarId,
        category: room.wordObj.category,
        word: room.wordObj.word,
        isHost: player.id === room.hostId
      });
    });
  });

  // 방장이 게임 종료/투표 화면으로 전환 요청
  socket.on('requestVoteScreen', (roomId) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.hostId) return;

    // 모든 참가자에게 투표 화면 상태 전달 (방장에겐 지목용 플레이어 리스트 제공)
    io.to(roomId).emit('showVoteScreen', {
      players: room.players
    });
  });

  // 방장이 라이어 지목
  socket.on('selectLiarCandidate', ({ roomId, candidateId }) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.hostId) return;

    const candidate = room.players.find(p => p.id === candidateId);
    if (!candidate) return;

    const isCorrect = candidateId === room.liarId;

    // 모든 플레이어에게 검증 결과 전송
    io.to(roomId).emit('voteResult', {
      candidateName: candidate.nickname,
      isCorrect: isCorrect
    });
  });

  // 게임 재시작 (대기실로 돌아가기)
  socket.on('restartGame', (roomId) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.hostId) return;

    room.state = 'waiting';
    io.to(roomId).emit('returnToLobby');
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          // 방장이 나가면 다음 사람에게 방장 위임
          if (socket.id === room.hostId) {
            room.hostId = room.players[0].id;
          }
          io.to(roomId).emit('updatePlayers', room.players);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
