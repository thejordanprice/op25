// State management
let state = {
  sendQueue: [],
  channels: [],
  currentChannelIndex: 0,
  status: null,
  error: null,
  tgidFrequencyRecord: {},
  systemInfo: { freq: null, wacn: null, sysid: null, error: null, tgid: null, channelName: "N/A" },
};

// Utility to format frequency in MHz
const formatFreq = (freq) => freq ? (freq / 1000000).toFixed(6) : "N/A";

// Update system status display
function updateSystemInfo() {
  const { freq, wacn, sysid, error, tgid, channelName } = state.systemInfo;
  document.getElementById('currentChannel').textContent = channelName;
  document.getElementById('currentFreq').textContent = formatFreq(freq);
  document.getElementById('currentWACN').textContent = wacn || "N/A";
  document.getElementById('currentSYSID').textContent = sysid || "N/A";
  document.getElementById('currentError').textContent = error || "N/A";
  document.getElementById('currentTgid').textContent = tgid || "N/A";
}

// Update TGID-Frequency record
function updateTgidFrequencyRecord(tgid, freq) {
  const freqKey = formatFreq(freq);
  if (!state.tgidFrequencyRecord[freqKey]) state.tgidFrequencyRecord[freqKey] = [];
  if (tgid && !state.tgidFrequencyRecord[freqKey].includes(tgid)) {
    state.tgidFrequencyRecord[freqKey].push(tgid);
  }
  displayTgidFrequencyRecord();
}

// Display TGID-Frequency list
function displayTgidFrequencyRecord() {
  const list = document.getElementById('tgidFrequencyList');
  list.innerHTML = "";
  for (const freq in state.tgidFrequencyRecord) {
    const item = document.createElement('li');
    item.className = "list-group-item";
    item.textContent = `Freq: ${freq} MHz, TGIDs: ${state.tgidFrequencyRecord[freq].join(', ')}`;
    list.appendChild(item);
  }
}

// Display response data
function displayResponseData(data) {
  const container = document.getElementById('responseContainer');
  container.innerHTML = "";
  data.forEach(entry => {
    switch (entry.json_type) {
      case "change_freq":
        state.systemInfo.freq = entry.freq;
        state.systemInfo.wacn = entry.wacn;
        state.systemInfo.sysid = entry.sysid;
        state.systemInfo.error = entry.error;
        state.systemInfo.tgid = entry.tgid;
        updateSystemInfo();
        updateTgidFrequencyRecord(entry.tgid, entry.freq);
        break;
      case "channel_update":
        state.channels = entry.channels || [];
        state.systemInfo.channelName = state.channels[state.currentChannelIndex] || "N/A";
        updateChannelSelect();
        updateSystemInfo();
        break;
      case "trunk_update":
        // Add more detailed trunking info if desired
        break;
      default:
        const p = document.createElement('p');
        p.textContent = JSON.stringify(entry);
        container.appendChild(p);
    }
  });
}

// Update channel dropdown
function updateChannelSelect() {
  const select = document.getElementById('channelSelect');
  select.innerHTML = state.channels.map((ch, i) => `<option value="${i}">${ch}</option>`).join('');
  select.value = state.currentChannelIndex;
}

// Add command to queue
function addToSendQueue(command, arg1 = 0, arg2 = 0) {
  if (state.sendQueue.length >= 10) state.sendQueue.shift(); // Limit queue size
  state.sendQueue.push({ command, arg1, arg2 });
  displaySendQueue();
}

// Send queue to server
async function sendQueue() {
  if (!state.sendQueue.length) {
    showStatus("error", "Queue is empty!");
    return;
  }
  const queueData = [...state.sendQueue];
  try {
    const response = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queueData),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    displayResponseData(data);
    showStatus("status", `Sent ${queueData.length} commands, received ${data.length} entries`);
    state.sendQueue = []; // Clear queue
    displaySendQueue();
  } catch (error) {
    showStatus("error", `Failed to send queue: ${error.message}`);
  }
}

// Display queue
function displaySendQueue() {
  const list = document.getElementById('sendQueueList');
  list.innerHTML = state.sendQueue.map(cmd => 
    `<li class="list-group-item">${cmd.command} (arg1: ${cmd.arg1}, arg2: ${cmd.arg2})</li>`
  ).join('');
}

// Show status or error
function showStatus(type, message) {
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');
  statusEl.style.display = type === "status" ? "block" : "none";
  errorEl.style.display = type === "error" ? "block" : "none";
  (type === "status" ? statusEl : errorEl).textContent = message;
}

// Switch views
function switchView(view) {
  const views = ["statusView", "plotView", "aboutView"];
  views.forEach(v => document.getElementById(v).classList.toggle("d-none", v !== view));
}

// Event listeners
document.getElementById('addToQueueButton').addEventListener('click', () => 
  addToSendQueue("update", 0, state.channels[state.currentChannelIndex] || 0));
document.getElementById('sendQueueButton').addEventListener('click', sendQueue);
document.getElementById('dumpTgidsButton').addEventListener('click', () => 
  addToSendQueue("dump_tgids", 0, state.channels[state.currentChannelIndex] || 0));
document.getElementById('channelPrevButton').addEventListener('click', () => {
  if (state.channels.length) {
    state.currentChannelIndex = (state.currentChannelIndex - 1 + state.channels.length) % state.channels.length;
    updateChannelSelect();
  }
});
document.getElementById('channelNextButton').addEventListener('click', () => {
  if (state.channels.length) {
    state.currentChannelIndex = (state.currentChannelIndex + 1) % state.channels.length;
    updateChannelSelect();
  }
});
document.getElementById('channelSelect').addEventListener('change', (e) => {
  state.currentChannelIndex = parseInt(e.target.value);
});
document.getElementById('statusTab').addEventListener('click', () => switchView("statusView"));
document.getElementById('plotTab').addEventListener('click', () => switchView("plotView"));
document.getElementById('aboutTab').addEventListener('click', () => switchView("aboutView"));

// Initial setup
window.addEventListener('load', () => {
  addToSendQueue("get_terminal_config", 0, 0); // Initial config fetch
  sendQueue();
  setInterval(() => {
    addToSendQueue("update", 0, state.channels[state.currentChannelIndex] || 0);
    sendQueue();
  }, 1000); // Poll every second
});