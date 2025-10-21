import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Commands
const commandPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
for (const file of commandFiles) {
    const command = (await import(`./commands/${file}`)).default;
    client.commands.set(command.data.name, command);
}

// Message Commands
const msgCommandPath = path.join(__dirname, 'messageCommands');
const msgCommandFiles = fs.readdirSync(msgCommandPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
for (const file of msgCommandFiles) {
    const command = (await import(`./messageCommands/${file}`)).default;
    client.msgCommands.set(command.name, command);
}

// Events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
for (const file of eventFiles) {
    const event = (await import(`./events/${file}`)).default;
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}
