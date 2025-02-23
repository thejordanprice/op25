// app.js

// State object to manage the queue, API interaction, and status
let state = {
  sendQueue: [
    { command: "get_config", arg1: 0, arg2: 0 }, // Initial command when the page loads
  ],
  status: null,
  error: null,
};

// Utility function to display the current queue in the UI
function displaySendQueue() {
  const queueList = document.getElementById('sendQueueList');
  queueList.innerHTML = '';
  state.sendQueue.forEach((command, index) => {
    const listItem = document.createElement('li');
    listItem.textContent = `${command.command} (arg1: ${command.arg1}, arg2: ${command.arg2})`;
    queueList.appendChild(listItem);
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
    
    // If the response contains an array of objects, handle it
    if (Array.isArray(data) && data.length > 0) {
      state.status = `Success: ${response.status} - Received ${data.length} entries`;
    } else {
      state.status = `Success: ${response.status} - No data returned`;
    }

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

// Add event listeners for the buttons
document.getElementById('addToQueueButton').addEventListener('click', () => {
  const command = {
    command: 'exampleCommand',
    arg1: 1,
    arg2: 2,
  };
  addToSendQueue(command); // Add a new command to the queue
});

document.getElementById('sendQueueButton').addEventListener('click', () => {
  sendQueue(); // Send the queue to the server
});

// Send the initial command when the page loads
window.addEventListener('load', () => {
  sendQueue();
});
