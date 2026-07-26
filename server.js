const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io 설정 (CORS 및 정적 파일 연결)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// public 폴더를 정적 파일 폴더로 지정
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
  console.log('유저 접속:', socket.id);

  socket.on('createRoom', ({ nickname }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[roomId] = {
      players: [{ id: socket.id, nickname }],
      state: 'waiting',
      wordObj: null,
      liarId: null
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, nickname });
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('errorMsg', '존재하지 않는 방입니다.');
    if (room.players.length >= 6) return socket.emit('errorMsg', '방이 꽉 찼습니다. (최대 6명)');
    if (room.state === 'playing') return socket.emit('errorMsg', '이미 게임이 진행 중입니다.');

    room.players.push({ id: socket.id, nickname });
    socket.join(roomId);
    socket.emit('joinedRoom', { roomId, nickname });
    io.to(roomId).emit('updatePlayers', room.players);
  });

  socket.on('startGame', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players.length < 2) return socket.emit('errorMsg', '최소 2명 이상이어야 합니다.');

    room.state = 'playing';
    room.wordObj = wordList[Math.floor(Math.random() * wordList.length)];
    const liarIndex = Math.floor(Math.random() * room.players.length);
    room.liarId = room.players[liarIndex].id;

    room.players.forEach(player => {
      if (player.id === room.liarId) {
        io.to(player.id).emit('gameStarted', { isLiar: true, category: room.wordObj.category });
      } else {
        io.to(player.id).emit('gameStarted', { isLiar: false, category: room.wordObj.category, word: room.wordObj.word });
      }
    });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) delete rooms[roomId];
        else io.to(roomId).emit('updatePlayers', room.players);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
