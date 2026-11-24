import { createServer } from "node:http";

import { Server as SocketIO } from "socket.io";

const ROOM_PORT = Number(process.env.ROOM_PORT || 3002);
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 8 * 1024 * 1024);

type UserToFollow = {
  socketId: string;
  username: string;
};

type OnUserFollowedPayload = {
  userToFollow: UserToFollow;
  action: "FOLLOW" | "UNFOLLOW";
};

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Excalidraw room relay is up :)");
});

const io = new SocketIO(httpServer, {
  transports: ["websocket", "polling"],
  cors: {
    origin: true,
    credentials: true,
  },
  allowEIO3: true,
  maxHttpBufferSize: MAX_FILE_BYTES,
});

io.on("connection", (socket) => {
  io.to(socket.id).emit("init-room");

  socket.on("join-room", async (roomID: string) => {
    if (typeof roomID !== "string" || !roomID) {
      return;
    }
    await socket.join(roomID);
    const sockets = await io.in(roomID).fetchSockets();

    if (sockets.length <= 1) {
      io.to(socket.id).emit("first-in-room");
    } else {
      socket.broadcast.to(roomID).emit("new-user", socket.id);
    }

    io.in(roomID).emit(
      "room-user-change",
      sockets.map((member) => member.id),
    );
  });

  socket.on(
    "server-broadcast",
    (roomID: string, encryptedData: ArrayBuffer, iv: Uint8Array) => {
      if (typeof roomID !== "string" || !roomID) {
        return;
      }
      socket.broadcast.to(roomID).emit("client-broadcast", encryptedData, iv);
    },
  );

  socket.on(
    "server-volatile-broadcast",
    (roomID: string, encryptedData: ArrayBuffer, iv: Uint8Array) => {
      if (typeof roomID !== "string" || !roomID) {
        return;
      }
      socket.volatile.broadcast
        .to(roomID)
        .emit("client-broadcast", encryptedData, iv);
    },
  );

  socket.on("user-follow", async (payload: OnUserFollowedPayload) => {
    if (!payload?.userToFollow?.socketId) {
      return;
    }
    const roomID = `follow@${payload.userToFollow.socketId}`;

    if (payload.action === "FOLLOW") {
      await socket.join(roomID);
      const sockets = await io.in(roomID).fetchSockets();
      io.to(payload.userToFollow.socketId).emit(
        "user-follow-room-change",
        sockets.map((member) => member.id),
      );
      return;
    }

    if (payload.action === "UNFOLLOW") {
      await socket.leave(roomID);
      const sockets = await io.in(roomID).fetchSockets();
      io.to(payload.userToFollow.socketId).emit(
        "user-follow-room-change",
        sockets.map((member) => member.id),
      );
    }
  });

  socket.on("disconnecting", async () => {
    const rooms = [...socket.rooms].filter((room) => room !== socket.id);
    for (const roomID of rooms) {
      const sockets = await io.in(roomID).fetchSockets();
      io.in(roomID).emit(
        "room-user-change",
        sockets.filter((member) => member.id !== socket.id).map((m) => m.id),
      );
    }
  });

  socket.on("disconnect", () => {
    socket.removeAllListeners();
  });
});

httpServer.listen(ROOM_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Room relay listening on :${ROOM_PORT}`);
});

const shutdown = () => {
  io.close();
  httpServer.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
