import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Create Socket.IO server
 * @param {import("http").Server} server - HTTP server instance
 * @param {Object} deps - Dependencies from app.locals.deps
 */
export function createSocketServer(server, deps) {
    const io = new Server(server, {
        cors: {
            origin: ["https://victor-studyhub.pages.dev", "http://localhost:5173"],
            methods: ["GET", "POST"],
            credentials: true,
        },
    });

    // Middleware for authentication
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error("Authentication error"));
        }

        try {
            const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
            socket.user = payload;
            next();
        } catch (err) {
            next(new Error("Authentication error"));
        }
    });

    io.on("connection", (socket) => {
        console.log(`User ${socket.user.id} connected`);

        // Join user room
        socket.join(socket.user.id);

        // Join conversation room
        socket.on("join_conversation", (conversationId) => {
            socket.join(conversationId);
            console.log(`User ${socket.user.id} joined room ${conversationId}`);
        });

        // Leave conversation room
        socket.on("leave_conversation", (conversationId) => {
            socket.leave(conversationId);
            console.log(`User ${socket.user.id} left room ${conversationId}`);
        });

        // Send message
        socket.on("send_message", async (data) => {
            try {
                const { conversation_id, content, type = "text" } = data;

                // Use existing service to save message
                const message = await deps.chatService.sendMessage({
                    sender_id: socket.user.id,
                    conversation_id,
                    content,
                    type,
                });

                // Get conversation to find receivers
                const conversation = await deps.conversationRepo.findById(conversation_id);
                const receivers = conversation.participants.filter(id => id !== socket.user.id);

                // Emit update to receivers' user rooms
                receivers.forEach(id => io.to(id).emit("conversation_update"));

                // Emit to conversation room (including sender)
                io.to(conversation_id).emit("receive_message", message);
            } catch (error) {
                socket.emit("error", { message: error.message });
            }
        });

        // Handle disconnect
        socket.on("disconnect", () => {
            console.log(`User ${socket.user.id} disconnected`);
        });
    });

    console.log("[Socket.IO] Server initialized");
    return io;
}
