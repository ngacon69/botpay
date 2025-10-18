const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const giveawayCommand = require('./Commands/giveawaystart');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Starting bot...');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_cL56QelHwXqf@ep-weathered-night-adfcxbnu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Kiểm tra env variables
const requiredEnvVars = ['BOTPAYOUT', 'CLIENT_ID_BOTPAYOUT', 'DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.log(`❌ ERROR: Missing environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

console.log('[✅] All environment variables are set');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
client.tempStockData = {};
client.autowarnEnabled = false;
client.pool = pool; // Make pool available globally

// Load commands
const commandsPath = path.join(__dirname, 'Commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`📁 Found ${commandFiles.length} command files`);

for (const file of commandFiles) {
    try {
        const filePath = path.join(commandsPath, file);
        delete require.cache[require.resolve(filePath)]; // Clear cache để reload
        const command = require(filePath);
        
        if (command.data && command.execute) {
            client.commands.set(command.data.name, command);
            console.log(`[✅] Loaded command: ${command.data.name}`);
        }
    } catch (error) {
        console.log(`[❌] Error loading command ${file}:`, error.message);
    }
}

// Auto-deploy commands khi bot ready
client.once('ready', async () => {
    console.log(`\n🎉 ${client.user.tag} is online!`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);
    console.log(`👥 Total users: ${client.users.cache.size}`);
    console.log(`🔧 Client ID: ${process.env.CLIENT_ID}`);
    
    // Deploy slash commands
    try {
        console.log(`\n[🔄] Deploying ${client.commands.size} slash commands...`);
        
        const commands = [];
        client.commands.forEach(command => {
            commands.push(command.data.toJSON());
        });

        const rest = new REST({ version: '10' }).setToken(process.env.BOTPAYOUT);
        
        console.log(`[🔧] Deploying to application: ${process.env.CLIENT_ID}`);
        
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        console.log(`[✅] Successfully deployed ${data.length} slash commands!`);
        console.log(`\n📝 Available commands:`);
        data.forEach(cmd => {
            console.log(`   ├─ /${cmd.name} : ${cmd.description}`);
        });
        
    } catch (error) {
        console.log('[❌] Error deploying commands:', error);
    }

    // Load interaction handlers
    console.log(`\n[🔧] Setting up interaction handlers...`);
    const interactionHandlers = [];
    
    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if (command.handleInteractions) {
                interactionHandlers.push(command);
                console.log(`[🔧] Setting up interactions for: ${command.data.name}`);
                command.handleInteractions(client);
            }
        } catch (error) {
            console.log(`[❌] Error loading interactions for ${file}:`, error.message);
        }
    }
    
    console.log(`[✅] Loaded ${interactionHandlers.length} interaction handlers`);
    
    // Set bot status với thông tin hữu ích
    client.user.setActivity(`${client.guilds.cache.size} servers | /help`, { 
        type: 'WATCHING' 
    });

    // Log bot info
    console.log(`\n🤖 Bot Information(botmod):`);
    console.log(`   ├─ Tag: ${client.user.tag}`);
    console.log(`   ├─ ID: ${client.user.id}`);
    console.log(`   ├─ Servers: ${client.guilds.cache.size}`);
    console.log(`   ├─ Users: ${client.users.cache.size}`);
    console.log(`   └─ Commands: ${client.commands.size}`);
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        console.log(`[🔧] ${interaction.user.tag} used /${interaction.commandName} in ${interaction.guild?.name || 'DM'}`);

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`[❌] Error executing /${interaction.commandName}:`, error);
            
            const errorMessage = {
                content: '❌ There was an error executing this command!',
                ephemeral: true
            };

            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(errorMessage).catch(console.error);
            } else {
                await interaction.reply(errorMessage).catch(console.error);
            }
        }
    }
});

// Xử lý lỗi toàn cục
client.on('error', (error) => {
    console.log('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.log('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.log('❌ Uncaught exception:', error);
});

// Kết nối bot
console.log('\n🔄 Connecting to Discord...');
client.login(process.env.BOTPAYOUT).catch(error => {
    console.log('❌ Failed to login:', error.message);
    process.exit(1);
});

// === ENHANCED WEB SERVER WITH STOCK MANAGEMENT ===
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Admin password
const ADMIN_PASSWORD = "onlyforbestadminmcfalol";

// Routes
app.get('/', (req, res) => {
    const botStatus = client.user ? 'Online 🟢' : 'Offline 🔴';
    const botInfo = client.user ? {
        tag: client.user.tag,
        id: client.user.id,
        servers: client.guilds.cache.size,
        users: client.users.cache.size,
        commands: client.commands.size,
        uptime: formatUptime(client.uptime)
    } : null;

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${process.env.BOT_NAME || 'Discord Bot'} Dashboard</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                    color: white;
                }
                .container { 
                    max-width: 1400px; 
                    margin: 0 auto; 
                }
                .header { 
                    text-align: center; 
                    margin-bottom: 40px;
                    padding: 20px;
                }
                .status-badge {
                    display: inline-block;
                    padding: 8px 16px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 20px;
                    margin-top: 10px;
                    font-weight: bold;
                }
                .nav-tabs {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 30px;
                    gap: 10px;
                }
                .nav-tab {
                    padding: 12px 24px;
                    background: rgba(255,255,255,0.1);
                    border: none;
                    border-radius: 8px;
                    color: white;
                    cursor: pointer;
                    font-size: 16px;
                    transition: all 0.3s;
                }
                .nav-tab:hover {
                    background: rgba(255,255,255,0.2);
                }
                .nav-tab.active {
                    background: rgba(255,255,255,0.3);
                    font-weight: bold;
                }
                .tab-content {
                    display: none;
                }
                .tab-content.active {
                    display: block;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin-bottom: 40px;
                }
                .stat-card {
                    background: rgba(255,255,255,0.1);
                    padding: 25px;
                    border-radius: 15px;
                    text-align: center;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.2);
                }
                .stat-number {
                    font-size: 2.5em;
                    font-weight: bold;
                    margin: 10px 0;
                }
                .commands-list {
                    background: rgba(255,255,255,0.1);
                    padding: 25px;
                    border-radius: 15px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.2);
                }
                .command-item {
                    padding: 10px;
                    margin: 5px 0;
                    background: rgba(255,255,255,0.1);
                    border-radius: 8px;
                }
                .stock-table {
                    width: 100%;
                    background: rgba(255,255,255,0.1);
                    border-radius: 15px;
                    overflow: hidden;
                    backdrop-filter: blur(10px);
                }
                .stock-table th,
                .stock-table td {
                    padding: 12px 15px;
                    text-align: left;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                }
                .stock-table th {
                    background: rgba(255,255,255,0.2);
                    font-weight: bold;
                }
                .stock-table tr:hover {
                    background: rgba(255,255,255,0.05);
                }
                .action-btn {
                    padding: 6px 12px;
                    margin: 2px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .btn-edit {
                    background: #f39c12;
                    color: white;
                }
                .btn-delete {
                    background: #e74c3c;
                    color: white;
                }
                .btn-add {
                    background: #27ae60;
                    color: white;
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    margin: 10px 0;
                }
                .modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.8);
                    z-index: 1000;
                }
                .modal-content {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: #2c3e50;
                    padding: 30px;
                    border-radius: 15px;
                    min-width: 500px;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                .form-group input,
                .form-group select,
                .form-group textarea {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 5px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                }
                .form-actions {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                    margin-top: 20px;
                }
                .login-form {
                    max-width: 400px;
                    margin: 50px auto;
                    background: rgba(255,255,255,0.1);
                    padding: 30px;
                    border-radius: 15px;
                    backdrop-filter: blur(10px);
                }
                .login-form input {
                    width: 100%;
                    padding: 12px;
                    margin: 10px 0;
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                }
                .login-form button {
                    width: 100%;
                    padding: 12px;
                    background: #27ae60;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                }
                .footer {
                    text-align: center;
                    margin-top: 40px;
                    padding: 20px;
                    opacity: 0.8;
                }
                .stock-count {
                    font-size: 1.2em;
                    font-weight: bold;
                    color: #27ae60;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🤖 ${process.env.BOT_NAME || 'Discord Bot'} Dashboard</h1>
                    <div class="status-badge">Status: ${botStatus}</div>
                </div>

                <div class="nav-tabs">
                    <button class="nav-tab active" onclick="showTab('dashboard')">📊 Dashboard</button>
                    <button class="nav-tab" onclick="showTab('stock')">📦 Stock Management</button>
                    <button class="nav-tab" onclick="showTab('commands')">⚡ Commands</button>
                </div>

                <div id="dashboard" class="tab-content active">
                    ${botInfo ? `
                    <div class="stats-grid">
                        <div class="stat-card">
                            <h3>📊 Servers</h3>
                            <div class="stat-number">${botInfo.servers}</div>
                        </div>
                        <div class="stat-card">
                            <h3>👥 Users</h3>
                            <div class="stat-number">${botInfo.users}</div>
                        </div>
                        <div class="stat-card">
                            <h3>⚡ Commands</h3>
                            <div class="stat-number">${botInfo.commands}</div>
                        </div>
                        <div class="stat-card">
                            <h3>⏰ Uptime</h3>
                            <div class="stat-number">${botInfo.uptime}</div>
                        </div>
                    </div>
                    ` : '<div class="stat-card"><h3>⏳ Bot is starting...</h3></div>'}
                </div>

                <div id="stock" class="tab-content">
                    <div id="stock-login">
                        <div class="login-form">
                            <h3>🔒 Admin Login</h3>
                            <input type="password" id="adminPassword" placeholder="Enter admin password">
                            <button onclick="loginToStock()">Login</button>
                        </div>
                    </div>
                    <div id="stock-content" style="display: none;">
                        <button class="btn-add" onclick="showAddStockModal()">➕ Add New Stock</button>
                        <div id="stock-table-container">
                            <div class="stat-card">
                                <h3>⏳ Loading stock data...</h3>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="commands" class="tab-content">
                    ${botInfo ? `
                    <div class="commands-list">
                        <h3>📝 Available Commands (${client.commands.size})</h3>
                        ${Array.from(client.commands.values()).map(cmd => `
                            <div class="command-item">
                                <strong>/${cmd.data.name}</strong> - ${cmd.data.description}
                            </div>
                        `).join('')}
                    </div>
                    ` : '<div class="stat-card"><h3>⏳ Bot is starting...</h3></div>'}
                </div>

                <div class="footer">
                    <p>Powered by Discord.js | ${new Date().getFullYear()}</p>
                </div>
            </div>

            <!-- Add/Edit Stock Modal -->
            <div id="stockModal" class="modal">
                <div class="modal-content">
                    <h3 id="modalTitle">Add Stock</h3>
                    <form id="stockForm">
                        <input type="hidden" id="stockId">
                        <div class="form-group">
                            <label>Service Type:</label>
                            <select id="serviceType" required>
                                <option value="">Select service type</option>
                                <option value="xbox_gamepass">Xbox GamePass</option>
                                <option value="xbox_ultimate">Xbox Ultimate</option>
                                <option value="fan_member">Fan Member</option>
                                <option value="mega_fan">Mega Fan</option>
                                <option value="minecraft_nonfull">Minecraft Non-Full</option>
                                <option value="minecraft_full">Minecraft Full</option>
                                <option value="redeem_code">Redeem Code</option>
                                <option value="robux">Robux</option>
                                <option value="ltc">LTC</option>
                                <option value="nitro">Nitro</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Account Data (email:password):</label>
                            <textarea id="accountData" rows="4" required placeholder="email1:password1&#10;email2:password2&#10;..."></textarea>
                        </div>
                        <div class="form-actions">
                            <button type="button" onclick="closeModal()">Cancel</button>
                            <button type="submit">Save Stock</button>
                        </div>
                    </form>
                </div>
            </div>

            <script>
                let isLoggedIn = false;

                function showTab(tabName) {
                    document.querySelectorAll('.tab-content').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    document.querySelectorAll('.nav-tab').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    document.getElementById(tabName).classList.add('active');
                    document.querySelector(\`[onclick="showTab('\${tabName}')"]\`).classList.add('active');

                    if (tabName === 'stock' && isLoggedIn) {
                        loadStockData();
                    }
                }

                function loginToStock() {
                    const password = document.getElementById('adminPassword').value;
                    if (password === '${ADMIN_PASSWORD}') {
                        isLoggedIn = true;
                        document.getElementById('stock-login').style.display = 'none';
                        document.getElementById('stock-content').style.display = 'block';
                        loadStockData();
                    } else {
                        alert('❌ Invalid password!');
                    }
                }

                function loadStockData() {
                    fetch('/api/stock')
                        .then(response => response.json())
                        .then(data => {
                            if (data.error) {
                                document.getElementById('stock-table-container').innerHTML = \`
                                    <div class="stat-card">
                                        <h3>❌ Error loading stock data</h3>
                                        <p>\${data.error}</p>
                                    </div>
                                \`;
                                return;
                            }

                            const stockByType = {};
                            data.stock.forEach(item => {
                                if (!stockByType[item.service_type]) {
                                    stockByType[item.service_type] = [];
                                }
                                stockByType[item.service_type].push(item);
                            });

                            let html = \`
                                <div class="stat-card">
                                    <h3>📦 Total Stock: <span class="stock-count">\${data.totalCount} accounts</span></h3>
                                </div>
                                <table class="stock-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Service Type</th>
                                            <th>Account Data</th>
                                            <th>Status</th>
                                            <th>Created</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                            \`;

                            Object.keys(stockByType).forEach(serviceType => {
                                const items = stockByType[serviceType];
                                html += \`
                                    <tr style="background: rgba(255,255,255,0.05);">
                                        <td colspan="6" style="font-weight: bold; background: rgba(255,255,255,0.1);">
                                            \${getServiceName(serviceType)} - \${items.length} accounts
                                        </td>
                                    </tr>
                                \`;
                                
                                items.forEach(item => {
                                    const [email, password] = item.account_data.split(':');
                                    html += \`
                                        <tr>
                                            <td>\${item.id}</td>
                                            <td>\${getServiceName(item.service_type)}</td>
                                            <td>
                                                <strong>Email:</strong> \${email}<br>
                                                <strong>Pass:</strong> \${password}
                                            </td>
                                            <td>\${item.used ? '❌ Used' : '✅ Available'}</td>
                                            <td>\${new Date(item.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <button class="action-btn btn-edit" onclick="editStock(\${item.id}, '\${item.service_type}', '\${item.account_data}')">Edit</button>
                                                <button class="action-btn btn-delete" onclick="deleteStock(\${item.id})">Delete</button>
                                            </td>
                                        </tr>
                                    \`;
                                });
                            });

                            html += \`
                                    </tbody>
                                </table>
                            \`;

                            document.getElementById('stock-table-container').innerHTML = html;
                        })
                        .catch(error => {
                            document.getElementById('stock-table-container').innerHTML = \`
                                <div class="stat-card">
                                    <h3>❌ Error loading stock data</h3>
                                    <p>\${error.message}</p>
                                </div>
                            \`;
                        });
                }

                function getServiceName(serviceType) {
                    const names = {
                        'xbox_gamepass': '🎮 Xbox GamePass',
                        'xbox_ultimate': '⚡ Xbox Ultimate',
                        'fan_member': '🌟 Fan Member',
                        'mega_fan': '💎 Mega Fan',
                        'minecraft_nonfull': '⛏️ Minecraft Non-Full',
                        'minecraft_full': '🔓 Minecraft Full',
                        'redeem_code': '🎫 Redeem Code',
                        'robux': '🟥 Robux',
                        'ltc': '💰 LTC',
                        'nitro': '🎁 Nitro'
                    };
                    return names[serviceType] || serviceType;
                }

                function showAddStockModal() {
                    document.getElementById('modalTitle').textContent = 'Add Stock';
                    document.getElementById('stockForm').reset();
                    document.getElementById('stockId').value = '';
                    document.getElementById('stockModal').style.display = 'block';
                }

                function editStock(id, serviceType, accountData) {
                    document.getElementById('modalTitle').textContent = 'Edit Stock';
                    document.getElementById('stockId').value = id;
                    document.getElementById('serviceType').value = serviceType;
                    document.getElementById('accountData').value = accountData;
                    document.getElementById('stockModal').style.display = 'block';
                }

                function closeModal() {
                    document.getElementById('stockModal').style.display = 'none';
                }

                document.getElementById('stockForm').addEventListener('submit', function(e) {
                    e.preventDefault();
                    saveStock();
                });

                function saveStock() {
                    const stockId = document.getElementById('stockId').value;
                    const serviceType = document.getElementById('serviceType').value;
                    const accountData = document.getElementById('accountData').value;

                    const url = stockId ? \`/api/stock/\${stockId}\` : '/api/stock';
                    const method = stockId ? 'PUT' : 'POST';

                    fetch(url, {
                        method: method,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            serviceType: serviceType,
                            accountData: accountData
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            closeModal();
                            loadStockData();
                        } else {
                            alert('❌ Error: ' + data.error);
                        }
                    })
                    .catch(error => {
                        alert('❌ Error saving stock: ' + error.message);
                    });
                }

                function deleteStock(id) {
                    if (!confirm('Are you sure you want to delete this stock?')) return;

                    fetch(\`/api/stock/\${id}\`, {
                        method: 'DELETE'
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            loadStockData();
                        } else {
                            alert('❌ Error: ' + data.error);
                        }
                    })
                    .catch(error => {
                        alert('❌ Error deleting stock: ' + error.message);
                    });
                }

                // Close modal when clicking outside
                window.onclick = function(event) {
                    const modal = document.getElementById('stockModal');
                    if (event.target === modal) {
                        closeModal();
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// API Routes
app.get('/api/stock', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM stocks 
            ORDER BY service_type, used, created_at DESC
        `);
        
        res.json({
            success: true,
            stock: result.rows,
            totalCount: result.rows.length
        });
    } catch (error) {
        console.error('Stock API error:', error);
        res.status(500).json({ error: 'Failed to fetch stock data' });
    }
});

app.post('/api/stock', async (req, res) => {
    try {
        const { serviceType, accountData } = req.body;
        
        if (!serviceType || !accountData) {
            return res.status(400).json({ error: 'Service type and account data are required' });
        }

        // Split multiple accounts
        const accounts = accountData.split('\n').filter(acc => acc.trim());
        
        for (const account of accounts) {
            if (account.includes(':')) {
                await pool.query(
                    'INSERT INTO stocks (service_type, account_data) VALUES ($1, $2)',
                    [serviceType, account.trim()]
                );
            }
        }

        res.json({ 
            success: true, 
            message: `Added ${accounts.length} account(s) to stock` 
        });
    } catch (error) {
        console.error('Add stock error:', error);
        res.status(500).json({ error: 'Failed to add stock' });
    }
});

app.put('/api/stock/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { serviceType, accountData } = req.body;
        
        if (!serviceType || !accountData) {
            return res.status(400).json({ error: 'Service type and account data are required' });
        }

        await pool.query(
            'UPDATE stocks SET service_type = $1, account_data = $2 WHERE id = $3',
            [serviceType, accountData.trim(), id]
        );

        res.json({ success: true, message: 'Stock updated successfully' });
    } catch (error) {
        console.error('Update stock error:', error);
        res.status(500).json({ error: 'Failed to update stock' });
    }
});

app.delete('/api/stock/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query('DELETE FROM stocks WHERE id = $1', [id]);

        res.json({ success: true, message: 'Stock deleted successfully' });
    } catch (error) {
        console.error('Delete stock error:', error);
        res.status(500).json({ error: 'Failed to delete stock' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    const status = client.user ? 'healthy' : 'unhealthy';
    res.json({
        status: status,
        timestamp: new Date().toISOString(),
        bot: client.user ? {
            tag: client.user.tag,
            uptime: client.uptime
        } : null,
        system: {
            memory: process.memoryUsage(),
            uptime: process.uptime()
        }
    });
});

// API endpoint để lấy thông tin bot
app.get('/api/botinfo', (req, res) => {
    if (!client.user) {
        return res.status(503).json({ error: 'Bot not ready' });
    }

    res.json({
        bot: {
            username: client.user.username,
            tag: client.user.tag,
            id: client.user.id,
            avatar: client.user.displayAvatarURL({ size: 256 })
        },
        stats: {
            servers: client.guilds.cache.size,
            users: client.users.cache.size,
            channels: client.channels.cache.size,
            commands: client.commands.size,
            uptime: client.uptime
        },
        commands: Array.from(client.commands.values()).map(cmd => ({
            name: cmd.data.name,
            description: cmd.data.description
        }))
    });
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log(`\n🌐 Web server running at http://localhost:${port}`);
    console.log(`📊 Dashboard available at http://localhost:${port}`);
    console.log(`📦 Stock management at http://localhost:${port} (password: ${ADMIN_PASSWORD})`);
    console.log(`❤️  Health check at http://localhost:${port}/health`);
    console.log(`🔧 API info at http://localhost:${port}/api/botinfo`);
});

// Hàm format uptime
function formatUptime(ms) {
    if (!ms) return '0s';
    
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.length > 0 ? parts.join(' ') : 'Just started';
}