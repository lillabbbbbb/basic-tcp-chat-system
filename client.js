const net = require('net');
const readline = require('readline');
const chalk = require('chalk').default;

// Setup readline with custom prompt
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
});

// --- Show guide ---
function showGuide() {
    console.log(chalk.cyan(`
========= NodeChat Guide =========
${chalk.yellow('/nick <nickname>')}      - Set your nickname
${chalk.yellow('/join <channel>')}      - Join a channel
${chalk.yellow('/msg <message>')}       - Send message to your current channel
${chalk.yellow('/dm <user> <message>')} - Send private message
${chalk.yellow('/leave')}               - Leave current channel
${chalk.yellow('/quit')}                - Disconnect from server
${chalk.yellow('/guide')}               - Show this guide again
Any other text typed will be sent to your current channel.
==================================
`));
}

// --- Highlight <text> ---
function highlightTags(message) {
    return message.replace(/<([^>]+)>/g, (match, p1) => chalk.magenta(`<${p1}>`));
}

// --- Format messages ---
function formatMessage(message) {
    if (!message) return '';

    message = highlightTags(message);

    // Private messages
    if (message.startsWith('[DM]')) {
        const parts = message.split(':');
        return chalk.magenta(parts[0] + ':') + ' ' + parts.slice(1).join(':').trim();
    }

    // Join/leave/disconnect notifications
    if (message.includes('joined') || message.includes('left') || message.includes('disconnected')) {
        return chalk.green(message);
    }

    // Channel messages [channel] username: message
    const channelMatch = message.match(/^\[(.+?)\]\s(.+?):\s(.+)/);
    if (channelMatch) {
        const channel = chalk.cyan(`[${channelMatch[1]}]`);
        const user = chalk.yellow(channelMatch[2]);
        const text = channelMatch[3];
        return `${channel} ${user}: ${text}`;
    }

    // System messages
    if (message.startsWith('Welcome') || message.startsWith('Nickname') || message.startsWith('You must')) {
        return chalk.green(message);
    }

    return message; // Default
}

// --- Connect to server ---
rl.question('Enter server IP (default 127.0.0.1): ', ip => {
    const host = ip.trim() || '127.0.0.1';
    const client = net.createConnection({ host, port: 5000 }, () => {
        console.log(chalk.green('Connected to server!'));
        showGuide();
        rl.prompt();
    });

    client.on('data', data => {
        const messages = data.toString().trim().split('\n');
        messages.forEach(msg => {
            if (msg) console.log(formatMessage(msg));
        });
        rl.prompt();
    });

    client.on('end', () => {
        console.log(chalk.red('Disconnected from server.'));
        process.exit(0);
    });

    rl.on('line', line => {
        if (line.trim() === '/guide') {
            showGuide();
            rl.prompt();
        } else {
            client.write(line + '\n');
        }
    });

    client.on('error', err => {
        console.log(chalk.red('Connection error: ' + err.message));
        process.exit(1);
    });
});

// Track current nickname
let nickname = null;

rl.on('line', line => {
    const trimmed = line.trim();

    // /guide command works anytime
    if (trimmed === '/guide') {
        showGuide();
        rl.prompt();
        return;
    }

    // /nick command updates nickname
    if (trimmed.startsWith('/nick')) {
        const parts = trimmed.split(' ');
        if (parts[1]) {
            nickname = parts[1]; // store locally
        }
        client.write(line + '\n'); // send to server
        rl.prompt();
        return;
    }

    // Prevent sending messages if nickname not set
    if (!nickname) {
        console.log(chalk.red('You must set a nickname first with /nick <name>'));
        rl.prompt();
        return;
    }

    // All other commands/messages
    client.write(line + '\n');
    rl.prompt();
});