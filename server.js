const net = require('net');

// --- Data Structures ---
const clients = new Map(); // socket -> { nickname, channel }
const channels = new Map(); // channelName -> Set<socket>

// --- Helper Functions ---
function debug(msg) {
    console.log(`[DEBUG] ${msg}`);
}

//Broadcast
function broadcast(message, channel, excludeSocket = null) {
    const members = channels.get(channel);
    if (!members) return;
    for (const client of members) {
        if (client !== excludeSocket) client.write(message + '\n');
    }
}

//Handle private message sending
function sendPrivate(senderSocket, targetNick, message) {
    for (const [socket, client] of clients) {
        if (client.nickname === targetNick) {
            socket.write(`[DM] ${clients.get(senderSocket).nickname}: ${message}\n`);
            debug(`Private message from ${clients.get(senderSocket).nickname} to ${targetNick}: ${message}`);
            return true;
        }
    }
    senderSocket.write(`User "${targetNick}" not found.\n`);
    debug(`Private message failed: ${targetNick} not found`);
    return false;
}

// --- Server Creation ---
const server = net.createServer(socket => {
    debug(`New connection from ${socket.remoteAddress}:${socket.remotePort}`);
    socket.write('Welcome to NodeChat! Set your nickname with /nick <name>\n');

    socket.on('data', data => {
        const input = data.toString().trim();
        if (!input) return;

        if (input.startsWith('/')) {
            const [command, ...args] = input.split(' ');

            switch (command) {
                case '/nick':
                    const nickname = args[0];
                    if (!nickname) {
                        socket.write('Usage: /nick <nickname>\n');
                        return;
                    }
                    // Check duplicates
                    for (const c of clients.values()) {
                        if (c.nickname === nickname) {
                            socket.write('Nickname already taken. Choose another.\n');
                            return;
                        }
                    }
                    clients.set(socket, { nickname, channel: null });
                    socket.write(`Nickname set to ${nickname}\n`);
                    debug(`Client at ${socket.remoteAddress}:${socket.remotePort} set nickname to ${nickname}`);
                    break;

                case '/join':
                    const channel = args[0];
                    if (!channel) {
                        socket.write('Usage: /join <channel>\n');
                        return;
                    }
                    const prev = clients.get(socket)?.channel;
                    if (prev) {
                        channels.get(prev)?.delete(socket);
                        broadcast(`${clients.get(socket).nickname} left ${prev}`, prev, socket);
                        debug(`${clients.get(socket).nickname} left channel ${prev}`);
                    }
                    clients.get(socket).channel = channel;
                    if (!channels.has(channel)) channels.set(channel, new Set());
                    channels.get(channel).add(socket);
                    socket.write(`Joined channel ${channel}\n`);
                    broadcast(`${clients.get(socket).nickname} joined ${channel}`, channel, socket);
                    debug(`${clients.get(socket).nickname} joined channel ${channel}`);
                    break;

                case '/msg':
                    const msg = args.join(' ');
                    const client = clients.get(socket);
                    if (!client || !client.channel) {
                        socket.write('You must join a channel first (/join <channel>)\n');
                        return;
                    }
                    broadcast(`[${client.channel}] ${client.nickname}: ${msg}`, client.channel, socket);
                    debug(`Message from ${client.nickname} in ${client.channel}: ${msg}`);
                    break;

                case '/dm':
                    const targetNick = args.shift();
                    const dmMessage = args.join(' ');
                    if (!targetNick || !dmMessage) {
                        socket.write('Usage: /dm <user> <message>\n');
                        return;
                    }
                    sendPrivate(socket, targetNick, dmMessage);
                    break;

                case '/leave':
                    const leaveChannel = clients.get(socket)?.channel;
                    if (!leaveChannel) {
                        socket.write('You are not in a channel.\n');
                        return;
                    }
                    channels.get(leaveChannel).delete(socket);
                    broadcast(`${clients.get(socket).nickname} left ${leaveChannel}`, leaveChannel, socket);
                    debug(`${clients.get(socket).nickname} left channel ${leaveChannel}`);
                    clients.get(socket).channel = null;
                    socket.write('Left channel\n');
                    break;

                case '/quit':
                    socket.end('Goodbye!\n');
                    break;

                default:
                    socket.write('Unknown command\n');
            }
        } else {
            // Send message to current channel
            const client = clients.get(socket);
            if (!client || !client.channel) {
                socket.write('You must join a channel first (/join <channel>)\n');
                return;
            }
            broadcast(`[${client.channel}] ${client.nickname}: ${input}`, client.channel, socket);
            debug(`Message from ${client.nickname} in ${client.channel}: ${input}`);
        }
    });

    //
    socket.on('close', () => {
        const client = clients.get(socket);
        if (client?.channel) {
            channels.get(client.channel)?.delete(socket);
            broadcast(`${client.nickname} disconnected`, client.channel, socket);
            debug(`${client.nickname} disconnected from channel ${client.channel}`);
        }
        debug(`Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
        clients.delete(socket);
    });

    socket.on('error', err => {
        console.log('Socket error:', err.message);
    });
});

const PORT = 5000;
server.listen(PORT, () => debug(`Chat server running on port ${PORT}`));