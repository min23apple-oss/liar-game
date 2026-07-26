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

// 카테고리별 단어 목록 (원하시는 단어를 얼마든지 추가할 수 있습니다!)
const wordData = {
  "物": ["スマホ", "メガネ拭き", "ランドリーバスケット", "布団", "ビニール袋", "傘", "冷蔵庫"、"ハンマー", "消火器", "ドローン", "顕微鏡", "望遠鏡", "鍋", "南京錠"、"砂時計", "トロフィー", "盾", "風船", "ゴミ箱"],
  "職業": ["医者", "警察官", "消防士", "教師",　"料理人", "アイドル", "看護師"、"俳優", "消火器", "ドローン", "顕微鏡", "望遠鏡", "鍋", "南京錠"、"砂時計", "トロフィー", "盾", "風船", "ゴミ箱"],
　"場所": ["スマホ", "メガネ拭き", "ランドリーバスケット", "布団", "ビニール袋", "傘", "冷蔵庫"、"ハンマー", "消火器", "ドローン", "顕微鏡", "望遠鏡", "鍋", "南京錠"、"砂時計", "トロフィー", "盾", "風船", "ゴミ箱"],
  "食べ物": ["スマホ", "メガネ拭き", "ランドリーバスケット", "布団", "ビニール袋", "傘", "冷蔵庫"、"ハンマー", "消火器", "ドローン", "顕微鏡", "望遠鏡", "鍋", "南京錠"、"砂時計", "トロフィー", "盾", "風船", "ゴミ箱"],
  "動物": ["スマホ", "メガネ拭き", "ランドリーバスケット", "布団", "ビニール袋", "傘", "冷蔵庫"、"ハンマー", "消火器", "ドローン", "顕微鏡", "望遠鏡", "鍋", "南京錠"、"砂時計", "トロフィー", "盾", "風船", "ゴミ箱"],
  "スポーツ": ["スマホ", "メガネ拭き", "ランドリーバスケット", "布団", "ビニール袋", "傘", "冷蔵庫"、"ハンマー", "消火器", "ドローン", "顕微鏡", "望遠鏡", "鍋", "南京錠"、"砂時計", "トロフィー", "盾", "風船", "ゴミ箱"],
  "衣類": ["スマホ", "メガネ拭き", "ランドリーバスケット", "布団", "ビニール袋", "傘", "冷蔵庫"、"ハンマー", "消火器", "ドローン", "顕微鏡", "望遠鏡", "鍋", "南京錠"、"砂時計", "トロフィー", "盾", "風船", "ゴミ箱"],
　"乗り物": ["スマホ", "メガネ拭き", "ランドリーバスケット", "布団", "ビニール袋", "傘", "冷蔵庫"、"ハンマー", "消火器", "ドローン", "顕微鏡", "望遠鏡", "鍋", "南京錠"、"砂時計", "トロフィー", "盾", "風船", "ゴミ箱"]
};

io.on('connection', (socket) => {
  socket.on('createRoom', ({ nickname }) => {
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    rooms[roomId] = {
      hostId: socket.id,
      players: [{ id: socket.id, nickname }],
      state: 'waiting',
      wordObj: null,
      liarId: null
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, nickname, isHost: true, categories: Object.keys(wordData) });
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('joinRoom', ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('errorMsg', '존재하지 않는 방입니다.');
    if (room.players.length >= 6) return socket.emit('errorMsg', '방이 꽉 찼습니다. (최대 6명)');
    if (room.state === 'playing') return socket.emit('errorMsg', '이미 게임이 진행 중입니다.');

    room.players.push({ id: socket.id, nickname });
    socket.join(roomId);
    socket.emit('joinedRoom', { roomId, nickname, isHost: false, categories: Object.keys(wordData) });
    io.to(roomId).emit('updatePlayers', room.players);
  });

  // 게임 시작 (방장이 선택한 카테고리 반영)
  socket.on('startGame', ({ roomId, selectedCategory }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players.length < 2) return socket.emit('errorMsg', '최소 2명 이상이어야 합니다.');

    // 선택한 카테고리의 단어 목록 불러오기
    const list = wordData[selectedCategory] || wordData["음식"];
    
    // 최소 2개 이상의 서로 다른 단어 2개 선택 (시민용, 라이어용)
    const shuffled = [...list].sort(() => 0.5 - Math.random());
    const citizenWord = shuffled[0];
    const liarWord = shuffled[1];

    room.state = 'playing';
    const liarIndex = Math.floor(Math.random() * room.players.length);
    room.liarId = room.players[liarIndex].id;

    // 각 유저에게 제시어 전달 (바보모드: 라이어에겐 라이어용 단어를 지급!)
    room.players.forEach(player => {
      const isLiar = player.id === room.liarId;
      io.to(player.id).emit('gameStarted', {
        category: selectedCategory,
        word: isLiar ? liarWord : citizenWord, // 라이어는 은밀하게 다른 단어를 받음!
        isHost: player.id === room.hostId
      });
    });
  });

  socket.on('requestVoteScreen', (roomId) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.hostId) return;

    io.to(roomId).emit('showVoteScreen', {
      players: room.players
    });
  });

  socket.on('selectLiarCandidate', ({ roomId, candidateId }) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.hostId) return;

    const candidate = room.players.find(p => p.id === candidateId);
    if (!candidate) return;

    const isCorrect = candidateId === room.liarId;

    io.to(roomId).emit('voteResult', {
      candidateName: candidate.nickname,
      isCorrect: isCorrect
    });
  });

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
