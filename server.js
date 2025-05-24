require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();

// Add basic middleware
app.use(express.json());

app.use((req, res, next) => {
  console.log("Incoming request:", {
    method: req.method,
    url: req.url,
    headers: req.headers,
  });
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "https://breakfast-bonanza-socket-server.onrender.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

io.use((socket, next) => {
  const userId = socket.handshake.auth.token;
  if (!userId) {
    console.log("Authentication failed - No token provided");
    return next(new Error("Unauthorized"));
  }
  socket.user = {
    id: userId,
    name: socket.handshake.auth.name,
    email: socket.handshake.auth.email,
  };
  next();
});

io.on("connection", (socket) => {
  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });

  socket.on("connect_error", (error) => {
    console.error("Connection error:", error);
  });

  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.user.id} joined room ${roomId}`);

    socket.to(roomId).emit("playerJoined", {
      playerId: socket.user.id,
      playerName: socket.user.name,
      playerEmail: socket.user.email,
    });
  });

  socket.on("updateScore", ({ roomId, score }) => {
    io.to(roomId).emit("scoreUpdated", {
      playerId: socket.user.id,
      score: score,
    });
  });

  socket.on("gameOver", async ({ roomId, winner, scores }) => {
    try {
      await prisma.match.create({
        data: {
          player1: scores.player1.id,
          player2: scores.player2.id,
          player1Score: scores.player1.score,
          player2Score: scores.player2.score,
          winner: winner,
        },
      });

      io.to(roomId).emit("gameEnded", {
        winner,
        scores,
      });

      console.log("Match recorded");
    } catch (e) {
      console.error("DB error", e);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User ${socket.user.id} disconnected`);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ Socket server running on port ${PORT}`);
  console.log(`Test the server at: http://localhost:${PORT}/test`);
});
