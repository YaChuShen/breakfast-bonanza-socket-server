require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// 驗證用戶身份
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const user = jwt.verify(token, process.env.NEXTAUTH_SECRET);
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Unauthorized'));
  }
});

// Socket 行為處理
io.on('connection', (socket) => {
  console.log(`${socket.user.email} connected`);

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    console.log(`${socket.user.name} joined room ${roomId}`);
  });

  socket.on('gameOver', async ({ roomId, winner }) => {
    try {
      await prisma.match.create({
        data: {
          player1: 'Serene', // 實際應用中從 socket.user 拿
          player2: 'ChatGPT',
          winner: winner,
        },
      });
      console.log('Match recorded');
    } catch (e) {
      console.error('DB error', e);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Socket server running on port ${PORT}`);
});
