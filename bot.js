// index.js
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();

// Load commands dynamically
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// Ready event
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // Auto-register all slash commands using client id
  try {
    for (const command of client.commands.values()) {
      await client.application.commands.create(command.data.toJSON());
      console.log(`✅ Slash command registered: ${command.data.name}`);
    }
  } catch (err) {
    console.error('Error registering commands:', err);
  }

  // Auto actions
  setInterval(() => {
    const random = Math.random();
    if (random < 0.8) {
      console.log('⛔ Playing "restock" automatically');
    } else {
      console.log('⛔ Playing "your mom" randomly');
    }
  }, 1000 * 60); // every 1 minute
});

// Interaction handling
client.on('interactionCreate', async (interaction) => {
  if (interaction.isCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
  }

  if (interaction.isButton()) {
    const command = client.commands.get('panelpayout');
    if (command) {
      await command.handleButton(interaction);
      if (interaction.customId.startsWith('approve_')) {
        await command.handleApprove(interaction);
      }
    }
  }

  if (interaction.isStringSelectMenu()) {
    const command = client.commands.get('panelpayout');
    if (command) await command.handleSelectMenu(interaction);
  }

  if (interaction.isModalSubmit()) {
    const command = client.commands.get('panelpayout');
    if (!command) return;
    if (interaction.customId === 'color_modal') {
      // handled in command
    } else if (interaction.customId.startsWith('credentials_')) {
      await command.handleCredentialsModal(interaction);
    }
  }
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);

client.login(process.env.TOKEN);
