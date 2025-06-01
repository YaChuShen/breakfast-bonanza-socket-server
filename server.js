require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");

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
const roomHosts = {};
const userRooms = new Map();

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
    socket.data.roomId = roomId;
    console.log(`User ${socket.user.name} joined room ${roomId}`);

    socket.to(roomId).emit("playerJoined", {
      playerId: socket.user.id,
      playerName: socket.user.name,
      playerEmail: socket.user.email,
    });

    socket.emit("hostInfo", roomHosts[roomId]);
  });

  socket.on("createRoom", (roomId) => {
    socket.join(roomId);
    userRooms.set(socket.user.id, roomId);
    socket.data.roomId = roomId;
    roomHosts[roomId] = {
      hostId: socket.user.id,
      hostName: socket.user.name,
      hostEmail: socket.user.email,
    };
  });

  socket.on("playerReady", (roomId) => {
    socket.to(roomId).emit("opponentReady", {
      playerId: socket.user.id,
      playerName: socket.user.name,
    });
  });

  socket.on("gameStart", (roomId) => {
    io.to(roomId).emit("hostStartTheGame");
  });

  socket.on("scoreUpdate", ({ roomId, score }) => {
    try {
      // Validate inputs
      if (!roomId || typeof score !== "number") {
        console.error("Invalid score update data:", { roomId, score });
        return;
      }

      console.log(
        `Score update from ${socket.user.name} in room ${roomId}, ID為: ${socket.user.id}, 分數為: ${score}`
      );

      // Emit to all other players in the room except the sender
      socket.to(roomId).emit("opponentScoreUpdate", {
        playerId: socket.user.id,
        playerName: socket.user.name,
        score,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error handling score update:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User ${socket.user.name} disconnected`);
    console.log(
      "Current userRooms before cleanup:",
      Object.fromEntries(userRooms)
    );

    // Get the room ID from our stored information
    const roomId = socket.data.roomId;

    if (roomId) {
      // If the disconnected user was the host, clear the host info
      let isHostDisconnected = false;
      if (roomHosts[roomId]?.hostId === socket.user.id) {
        console.log("Host disconnected, clearing room:", roomId);
        delete roomHosts[roomId];
        isHostDisconnected = true;
      }

      // Notify other players in the room about the disconnection
      console.log("Emitting disconnect event to room:", roomId);
      socket.to(roomId).emit("playerDisconnected", {
        playerId: socket.user.id,
        playerName: socket.user.name,
        isHostDisconnected,
      });

      // Clean up the stored room information
      userRooms.delete(socket.user.id);
      console.log(
        "Current userRooms after cleanup:",
        Object.fromEntries(userRooms)
      );
    } else {
      console.log("No room found for disconnected user");
    }
  });

  // socket.on("gameOver", async ({ roomId, winner, scores }) => {
  //   try {
  //     await prisma.match.create({
  //       data: {
  //         player1: scores.player1.id,
  //         player2: scores.player2.id,
  //         player1Score: scores.player1.score,
  //         player2Score: scores.player2.score,
  //         winner: winner,
  //       },
  //     });

  //     io.to(roomId).emit("gameEnded", {
  //       winner,
  //       scores,
  //     });

  //     console.log("Match recorded");
  //   } catch (e) {
  //     console.error("DB error", e);
  //   }
  // });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ Socket server running on port ${PORT}`);
  console.log(`Test the server at: http://localhost:${PORT}/test`);
});
