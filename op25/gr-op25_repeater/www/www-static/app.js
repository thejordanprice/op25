// State object to manage the queue, API interaction, and status
let state = {
  sendQueue: [
    { command: "get_config", arg1: 0, arg2: 0 },
  ],
  status: null,
  error: null,
  tgidFrequencyRecord: {}, // Record of TGIDs and their associated frequencies
};

// Function to display the current frequency, WACN, SYSID, and error
function updateCurrentInfo(freq, wacn, sysid, error) {
  const currentFreq = document.getElementById('currentFreq');
  const currentWACN = document.getElementById('currentWACN');
  const currentSYSID = document.getElementById('currentSYSID');
  const currentError = document.getElementById('currentError');
  
  currentFreq.textContent = freq ? `${freq}` : 'N/A';
  currentWACN.textContent = wacn ? wacn : 'N/A';
  currentSYSID.textContent = sysid ? sysid : 'N/A';
  currentError.textContent = error ? error : 'N/A';
}

// Function to update the TGID-Frequency relationship record
function updateTgidFrequencyRecord(tgid, freq) {
  if (!state.tgidFrequencyRecord[freq]) {
    state.tgidFrequencyRecord[freq] = [];
  }

  if (!state.tgidFrequencyRecord[freq].includes(tgid)) {
    state.tgidFrequencyRecord[freq].push(tgid);
  }

  // Display the updated TGID-Frequency record
  displayTgidFrequencyRecord();
}

// Function to display the active TGIDs on frequencies
function displayTgidFrequencyRecord() {
  const tgidFrequencyList = document.getElementById('tgidFrequencyList');
  tgidFrequencyList.innerHTML = ''; // Clear previous entries

  for (const freq in state.tgidFrequencyRecord) {
    const listItem = document.createElement('li');
    listItem.textContent = `Frequency: ${freq} Hz, TGIDs: ${state.tgidFrequencyRecord[freq].join(', ')}`;
    tgidFrequencyList.appendChild(listItem);
  }
}

// Function to display the response data on the page
function displayResponseData(data) {
  const responseContainer = document.getElementById('responseContainer');
  responseContainer.innerHTML = ''; // Clear any previous content

  data.forEach((entry) => {
    if (entry.json_type === 'change_freq') {
      // Update current frequency, WACN, SYSID, and error
      updateCurrentInfo(entry.freq, entry.wacn, entry.sysid, entry.error);

      // Update the active TGID-Frequency record
      if (entry.tgid) {
        updateTgidFrequencyRecord(entry.tgid, entry.freq);
      }
    }
    // You can add more checks for other types of data (e.g., "trunk_update", "rx_update", etc.)
  });
}

// Function to add a command to the queue
function addToSendQueue(command) {
  if (state.sendQueue.length >= 10) {
    // If the queue is too large, remove the oldest item
    state.sendQueue.shift();
  }
  state.sendQueue.push(command);
  displaySendQueue(); // Update the UI to show the updated queue
}

// Function to send the queue to the API
async function sendQueue() {
  if (state.sendQueue.length === 0) {
    alert('The queue is empty!');
    return;
  }

  const queueData = [...state.sendQueue]; // Copy of the queue to send

  try {
    const response = await fetch('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queueData),
    });

    if (!response.ok) {
      throw new Error('Failed to send the queue');
    }

    const data = await response.json();
    
    // Display the response data in the DOM
    displayResponseData(data);

    state.status = `Success: ${response.status} - Received ${data.length} entries`;
    state.error = null; // Clear any previous errors
    displayStatus();

    // Clear the queue after sending
    state.sendQueue = [];
    displaySendQueue();

  } catch (error) {
    // Handle any errors from the API request
    state.error = `Error: ${error.message}`;
    state.status = null;
    displayStatus();
  }
}

// Function to display the status or error message
function displayStatus() {
  const statusElement = document.getElementById('status');
  const errorElement = document.getElementById('error');

  if (state.status) {
    statusElement.textContent = state.status;
    errorElement.textContent = ''; // Clear any previous error
  }

  if (state.error) {
    errorElement.textContent = state.error;
    statusElement.textContent = ''; // Clear any previous success message
  }
}

// Function to display the current queue in the UI
function displaySendQueue() {
  const queueList = document.getElementById('sendQueueList');
  queueList.innerHTML = '';
  state.sendQueue.forEach((command, index) => {
    const listItem = document.createElement('li');
    listItem.textContent = `${command.command} (arg1: ${command.arg1}, arg2: ${command.arg2})`;
    queueList.appendChild(listItem);
  });
}

// Add event listeners for the buttons
document.getElementById('addToQueueButton').addEventListener('click', () => {
  const command = {
    command: 'update',
    arg1: 0,
    arg2: 0,
  };
  addToSendQueue(command); // Add a new command to the queue
});

document.getElementById('sendQueueButton').addEventListener('click', () => {
  sendQueue(); // Send the queue to the server
});

// Send the initial command when the page loads
window.addEventListener('load', () => {
  // Add the update command every second
  setInterval(() => {
    const updateCommand = {
      command: 'update',
      arg1: 0,
      arg2: 0,
    };
    addToSendQueue(updateCommand); // Add update command to the queue every second
    sendQueue(); // Send the queue after adding the command
  }, 1000); // 1000ms = 1 second
});
