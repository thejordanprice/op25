// State management
let state = {
  sendQueue: [],
  connectionState: "disconnected",
  systemInfo: { 
    freq: null, 
    wacn: null, 
    sysid: null, 
    error: null, 
    tgid: null, 
    nac: null, 
    rfid: null, 
    stid: null 
  },
};

// Utility to format frequency in MHz
const formatFreq = (freq) => freq ? (freq / 1000000).toFixed(6) : "N/A";

// Update system status display
function updateSystemInfo() {
  const { freq, wacn, sysid, error, tgid, nac, rfid, stid } = state.systemInfo;
  document.getElementById('currentFreq').textContent = formatFreq(freq);
  document.getElementById('currentWACN').textContent = wacn || "N/A";
  document.getElementById('currentSYSID').textContent = sysid || "N/A";
  document.getElementById('currentError').textContent = error ? `${error} Hz` : "N/A";
  document.getElementById('currentTgid').textContent = tgid || "N/A";
  document.getElementById('currentNac').textContent = nac || "N/A";
  document.getElementById('currentRfid').textContent = rfid || "N/A";
  document.getElementById('currentStid').textContent = stid || "N/A";
}

// Display response data
function displayResponseData(data) {
  data.forEach(entry => {
    switch (entry.json_type) {
      case "change_freq":
        state.systemInfo.freq = entry.freq;
        state.systemInfo.wacn = entry.wacn;
        state.systemInfo.sysid = entry.sysid;
        state.systemInfo.error = entry.error;
        state.systemInfo.tgid = entry.tgid;
        updateSystemInfo();
        break;

      case "trunk_update":
        if (entry.nac !== undefined) state.systemInfo.nac = entry.nac;
        for (const nac in entry) {
          if (!/^\d/.test(nac)) continue;
          
          const nacData = entry[nac];
          const isP25 = nacData.type === 'p25';
          const isSmartnet = nacData.type === 'smartnet';

          state.systemInfo.nac = nac === state.systemInfo.nac || !nacData.system ? entry.nac : state.systemInfo.nac;
          state.systemInfo.rfid = nacData.rfid || null;
          state.systemInfo.stid = nacData.stid || null;
          updateSystemInfo();

          const tbody = document.getElementById('tgidFrequencyBody');
          const tableTitle = document.getElementById('tableTitle');
          tbody.innerHTML = "";
          tableTitle.textContent = `System Frequencies (NAC: ${nac})`;

          for (const freq in nacData.frequency_data) {
            const fData = nacData.frequency_data[freq];
            const row = document.createElement('tr');
            const freqMHz = formatFreq(parseInt(freq));
            const chanType = fData.type;
            const tg1 = fData.tgids[0];
            const tg2 = fData.tgids[1];
            let mode = "";
            let tgCell = "";

            if (chanType === 'control') {
              tgCell = `<td colspan="2" class="text-center">Control</td>`;
              mode = isP25 ? "CC" : isSmartnet ? "CC" : "CC";
              fData.counter = "";
            } else if (chanType === 'alternate') {
              mode = isP25 ? "Sec CC" : "Alt CC";
              tgCell = `<td colspan="2" class="text-center">-</td>`;
            } else {
              mode = (isSmartnet && (tg1 || tg2)) ? fData.mode : (tg1 === tg2 ? "FDMA" : "TDMA");
              tgCell = (tg1 === null && tg2 === null) ? `<td colspan="2" class="text-center">-</td>` :
                       (tg1 === tg2) ? `<td colspan="2" class="text-center">${tg1 || '-'}</td>` :
                       `<td class="text-center">${tg2 || '-'}</td><td class="text-center">${tg1 || '-'}</td>`;
            }

            row.innerHTML = `
              <td>${freqMHz}</td>
              <td class="text-end">${fData.last_activity || ''}</td>
              ${tgCell}
              <td class="text-center">${mode}</td>
              <td class="text-end">${fData.counter || ''}</td>
            `;
            tbody.appendChild(row);
          }
        }
        break;

      default:
        console.log("Unhandled response:", entry);
    }
  });
}

// Add command to queue
function addToSendQueue(command, arg1 = 0, arg2 = 0) {
  if (state.sendQueue.length >= 10) state.sendQueue.shift();
  state.sendQueue.push({ command, arg1, arg2 });
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
    showStatus("connected", "Connected");
    state.sendQueue = [];
  } catch (error) {
    showStatus("error", `Error: ${error.message}`);
  }
}

// Show connection status
function showStatus(stateName, message) {
  const statusEl = document.getElementById('connectionStatus');
  state.connectionState = stateName;
  statusEl.className = "alert";
  statusEl.classList.remove("alert-success", "alert-warning", "alert-danger");
  
  switch (stateName) {
    case "connected":
      statusEl.classList.add("alert-success");
      statusEl.textContent = message || "Connected";
      break;
    case "error":
      statusEl.classList.add("alert-warning");
      statusEl.textContent = message || "Error";
      break;
    case "disconnected":
      statusEl.classList.add("alert-danger");
      statusEl.textContent = message || "Disconnected";
      break;
  }
  statusEl.style.display = "block";
}

// Initial setup
window.addEventListener('load', () => {
  showStatus("disconnected", "Disconnected");
  addToSendQueue("get_terminal_config", 0, 0);
  sendQueue();
  setInterval(() => {
    addToSendQueue("update", 0, 0);
    sendQueue();
  }, 1000);
});