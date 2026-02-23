import { io } from 'socket.io-client';

const socket = io('http://localhost:3334', {
    transports: ['websocket', 'polling'],
});

console.log('Attempting to connect to backend socket...');

socket.on('connect', () => {
    console.log('Connected! ID:', socket.id);
    console.log('Subscribing to NIFTY 50 and RELIANCE.NS');
    socket.emit('subscribeStock', 'NIFTY 50');
    socket.emit('subscribeStock', 'RELIANCE.NS');
});

socket.on('priceUpdate', (data) => {
    console.log('Price Update Received:', data);
});

socket.on('connect_error', (error) => {
    console.log('Connection Error:', error.message);
});

setTimeout(() => {
    console.log('Closing socket check...');
    socket.close();
    process.exit(0);
}, 60000);
