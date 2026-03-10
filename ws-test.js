const { io } = require("socket.io-client");

const socket = io("http://localhost:3334", {
    transports: ['websocket'],
    reconnectionDelayMax: 10000,
});

socket.on("connect", () => {
    console.log("Connected to backend! Socket ID:", socket.id);

    // Subscribe to a few ticker symbols
    console.log("Subscribing to RELIANCE.NS, NIFTY 50");
    socket.emit("subscribeStock", "RELIANCE.NS");
    socket.emit("subscribeStock", "NIFTY 50");
});

socket.on("priceUpdate", (data) => {
    console.log("[PRICE UPDATE]", data.symbol, data.price, `(Change: ${data.changePercent?.toFixed(2)}%)`);
});

socket.on("disconnect", (reason) => {
    console.log("Disconnected:", reason);
});

socket.on("connect_error", (err) => {
    console.log("Connect Error:", err.message);
});
