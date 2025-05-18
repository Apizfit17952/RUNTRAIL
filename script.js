let checkpointData = JSON.parse(localStorage.getItem("checkpointData")) || {};
let checkpoints = JSON.parse(localStorage.getItem("checkpoints")) || ["Start", "Checkpoint 1", "Checkpoint 2", "Finish"];
let leaderboard = [];
const ADMIN_PASSWORD = "admin123";
let isAuthenticated = localStorage.getItem("isAdminAuthenticated") === "true";

// Debounce utility function to limit search updates
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function authenticateAdmin() {
  const passwordInput = document.getElementById("adminPassword").value;
  if (passwordInput === ADMIN_PASSWORD) {
    isAuthenticated = true;
    localStorage.setItem("isAdminAuthenticated", "true");
    document.getElementById("auth-container").style.display = "none";
    document.getElementById("main-content").style.display = "block";
    if (window.location.pathname.includes("settings.html")) {
      displayCheckpointList();
      displayRaceEventName();
    } else {
      displayCheckpointLog();
      setupRunnerAutocomplete();
    }
    showNotification("Admin access granted", "success");
  } else {
    showNotification("Incorrect password", "error");
    document.getElementById("adminPassword").value = "";
  }
}

function logoutAdmin() {
  isAuthenticated = false;
  localStorage.removeItem("isAdminAuthenticated");
  document.getElementById("main-content").style.display = "none";
  document.getElementById("auth-container").style.display = "block";
  document.getElementById("adminPassword").value = "";
  document.getElementById("adminPassword").focus();
  showNotification("Logged out successfully", "info");
}

document.addEventListener('DOMContentLoaded', function() {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark" || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add("dark");
  }

  // Display race event name on page load
  displayRaceEventName();

  if (window.location.pathname.includes("leaderboard.html")) {
    updateEnhancedLeaderboard();
    const searchInput = document.getElementById("searchLeaderboard");
    if (searchInput) {
      searchInput.addEventListener('input', debounce(() => updateEnhancedLeaderboard(), 300));
    }
  } else if (document.getElementById("auth-container")) {
    if (isAuthenticated) {
      document.getElementById("auth-container").style.display = "none";
      document.getElementById("main-content").style.display = "block";
      if (window.location.pathname.includes("settings.html")) {
        displayCheckpointList();
        displayRaceEventName();
      } else {
        displayCheckpointLog();
        setupRunnerAutocomplete();
        const searchInput = document.getElementById("searchInput");
        if (searchInput) {
          searchInput.addEventListener('input', debounce(() => displayCheckpointLog(), 300));
        }
      }
    } else {
      document.getElementById("auth-container").style.display = "block";
      document.getElementById("main-content").style.display = "none";
      document.getElementById("adminPassword").addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          authenticateAdmin();
        }
      });
    }
  }

  const runnerIdInput = document.getElementById("runnerId");
  if (runnerIdInput) {
    runnerIdInput.addEventListener('keypress', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        logCheckpoint();
      }
    });
  }

  const statusRunnerIdInput = document.getElementById("statusRunnerId");
  if (statusRunnerIdInput) {
    statusRunnerIdInput.addEventListener('keypress', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        // Optionally trigger markRunnerDNS or markRunnerDNF based on context
      }
    });
  }

  updateThemeToggleIcon();

  // Listen for navigation to refresh race event name
  document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', () => {
      setTimeout(displayRaceEventName, 100); // Delay to ensure page load
    });
  });
});

function getCheckpointIcon(checkpoint) {
  if (checkpoint === "Start") return "fa-play";
  if (checkpoint === "Finish") return "fa-flag-checkered";
  const index = checkpoints.indexOf(checkpoint);
  if (index > 0 && index < checkpoints.length - 1) return `fa-${index}`;
  return "fa-map-marker-alt";
}

function getStatusIcon(status) {
  switch(status) {
    case "finished": return "fa-check-circle";
    case "in-progress": return "fa-hourglass-half";
    case "dnf": return "fa-times-circle";
    case "dns": return "fa-ban";
    default: return "fa-question-circle";
  }
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function logCheckpoint() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  let runnerId = document.getElementById("runnerId").value.trim();

  if (!runnerId) {
    showNotification("Please enter a Runner ID", "error");
    return;
  }

  if (!checkpointData[runnerId]) {
    showNotification(`Runner ${runnerId} not found. Please import runner data first.`, "error");
    return;
  }

  if (checkpointData[runnerId].status === "dns") {
    showNotification(`Runner ${runnerId} is marked as DNS and cannot log checkpoints`, "error");
    return;
  }

  let timestamp = new Date().getTime();

  let lastCheckpoint = checkpointData[runnerId].checkpoints.length > 0
    ? checkpointData[runnerId].checkpoints[checkpointData[runnerId].checkpoints.length - 1].checkpoint
    : null;

  let nextCheckpointIndex = lastCheckpoint ? checkpoints.indexOf(lastCheckpoint) + 1 : 0;
  let nextCheckpoint = checkpoints[nextCheckpointIndex];

  if (checkpointData[runnerId].checkpoints.some(entry => entry.checkpoint === "Finish")) {
    showNotification(`Runner ${runnerId} has already finished the race`, "error");
    return;
  }

  if (nextCheckpointIndex >= checkpoints.length) {
    nextCheckpoint = "Finish";
  }

  checkpointData[runnerId].checkpoints.push({ 
    checkpoint: nextCheckpoint, 
    timestamp 
  });

  localStorage.setItem("checkpointData", JSON.stringify(checkpointData));

  showNotification(`Logged ${nextCheckpoint} for Runner ${runnerId}`, "success");

  displayCheckpointLog();
  clearInput();
}

function flagOffRace() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (Object.keys(checkpointData).length === 0) {
    showNotification("No runners registered. Please import runners first.", "error");
    return;
  }

  if (!confirm("Are you sure you want to flag off the race? This will log the 'Start' checkpoint for all eligible runners.")) {
    return;
  }

  let timestamp = new Date().getTime();
  let startCount = 0;

  for (let runnerId in checkpointData) {
    if (checkpointData[runnerId].checkpoints.some(entry => entry.checkpoint === "Start") ||
        checkpointData[runnerId].checkpoints.some(entry => entry.checkpoint === "Finish") ||
        checkpointData[runnerId].status === "dns") {
      continue;
    }

    checkpointData[runnerId].checkpoints.push({
      checkpoint: "Start",
      timestamp
    });
    startCount++;
  }

  if (startCount === 0) {
    showNotification("No eligible runners to start. All runners have either started, finished, or are marked DNS.", "warning");
    return;
  }

  localStorage.setItem("checkpointData", JSON.stringify(checkpointData));
  showNotification(`Race started! Logged 'Start' checkpoint for ${startCount} runners.`, "success");
  displayCheckpointLog();
  updateEnhancedLeaderboard();
}

function markRunnerDNS() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const runnerId = document.getElementById("statusRunnerId").value.trim();
  if (!runnerId) {
    showNotification("Please enter a Runner ID", "error");
    return;
  }

  if (!checkpointData[runnerId]) {
    showNotification(`Runner ${runnerId} not found`, "error");
    return;
  }

  if (checkpointData[runnerId].checkpoints.length > 0) {
    showNotification(`Runner ${runnerId} has already started and cannot be marked as DNS`, "error");
    return;
  }

  checkpointData[runnerId].status = "dns";
  localStorage.setItem("checkpointData", JSON.stringify(checkpointData));
  showNotification(`Runner ${runnerId} marked as DNS`, "success");
  document.getElementById("statusRunnerId").value = "";
  displayCheckpointLog();
  updateEnhancedLeaderboard();
}

function markRunnerDNF() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const runnerId = document.getElementById("statusRunnerId").value.trim();
  if (!runnerId) {
    showNotification("Please enter a Runner ID", "error");
    return;
  }

  if (!checkpointData[runnerId]) {
    showNotification(`Runner ${runnerId} not found`, "error");
    return;
  }

  if (checkpointData[runnerId].checkpoints.some(entry => entry.checkpoint === "Finish")) {
    showNotification(`Runner ${runnerId} has already finished and cannot be marked as DNF`, "error");
    return;
  }

  if (checkpointData[runnerId].status === "dns") {
    showNotification(`Runner ${runnerId} is marked as DNS and cannot be marked as DNF`, "error");
    return;
  }

  checkpointData[runnerId].status = "dnf";
  localStorage.setItem("checkpointData", JSON.stringify(checkpointData));
  showNotification(`Runner ${runnerId} marked as DNF`, "success");
  document.getElementById("statusRunnerId").value = "";
  displayCheckpointLog();
  updateEnhancedLeaderboard();
}

function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification ${type} fade-in`;

  let icon = "fa-info-circle";
  if (type === "success") icon = "fa-check-circle";
  if (type === "error") icon = "fa-exclamation-circle";
  if (type === "warning") icon = "fa-exclamation-triangle";

  notification.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${message}</span>
    <button onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.add("fade-out");
      setTimeout(() => notification.remove(), 500);
    }
  }, 5000);
}

function clearInput() {
  document.getElementById("runnerId").value = "";
  document.getElementById("runnerId").focus();
}

function displayCheckpointLog() {
  if (!isAuthenticated) return;

  const logList = document.getElementById("checkpointLog");
  if (!logList) return;

  const searchQuery = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  logList.innerHTML = "";

  let foundEntries = false;

  for (let runner in checkpointData) {
    if (searchQuery && !runner.toLowerCase().includes(searchQuery) && !checkpointData[runner].name.toLowerCase().includes(searchQuery)) continue;

    if (checkpointData[runner].status === "dns") {
      foundEntries = true;
      let listItem = document.createElement("li");
      listItem.classList.add("fade-in", "log-item");
      const statusIcon = getStatusIcon("dns");
      listItem.innerHTML = `
        <div class="log-item-icon status-icon dns">
          <i class="fas ${statusIcon}"></i>
        </div>
        <div class="log-item-content">
          <div class="log-item-title">Runner ${runner} (${checkpointData[runner].name}) <span class="badge dns"><i class="fas ${statusIcon}"></i> DNS</span></div>
          <div class="log-item-time">Did Not Start</div>
        </div>
      `;
      logList.appendChild(listItem);
      continue;
    }

    if (checkpointData[runner].status === "dnf") {
      foundEntries = true;
      let listItem = document.createElement("li");
      listItem.classList.add("fade-in", "log-item");
      const statusIcon = getStatusIcon("dnf");
      listItem.innerHTML = `
        <div class="log-item-icon status-icon dnf">
          <i class="fas ${statusIcon}"></i>
        </div>
        <div class="log-item-content">
          <div class="log-item-title">Runner ${runner} (${checkpointData[runner].name}) <span class="badge dnf"><i class="fas ${statusIcon}"></i> DNF</span></div>
          <div class="log-item-time">Did Not Finish</div>
        </div>
      `;
      logList.appendChild(listItem);
    }

    checkpointData[runner].checkpoints.forEach((entry) => {
      foundEntries = true;
      let listItem = document.createElement("li");
      listItem.classList.add("fade-in", "log-item");

      const icon = getCheckpointIcon(entry.checkpoint);
      const timeFormatted = formatTimestamp(entry.timestamp);

      listItem.innerHTML = `
        <div class="log-item-icon">
          <i class="fas ${icon}"></i>
        </div>
        <div class="log-item-content">
          <div class="log-item-title">Runner ${runner} (${checkpointData[runner].name}) reached ${entry.checkpoint}</div>
          <div class="log-item-time">${timeFormatted}</div>
        </div>
      `;

      logList.appendChild(listItem);
    });
  }

  if (!foundEntries && searchQuery) {
    let noResults = document.createElement("li");
    noResults.classList.add("log-item");
    noResults.innerHTML = `
      <div class="log-item-icon">
        <i class="fas fa-search"></i>
      </div>
      <div class="log-item-content">
        <div class="log-item-title">No results found for "${searchQuery}"</div>
      </div>
    `;
    logList.appendChild(noResults);
  } else if (!foundEntries) {
    let noLogs = document.createElement("li");
    noLogs.classList.add("log-item");
    noLogs.innerHTML = `
      <div class="log-item-icon">
        <i class="fas fa-info-circle"></i>
      </div>
      <div class="log-item-content">
        <div class="log-item-title">No checkpoint logs yet</div>
        <div class="log-item-time">Enter a Runner ID and click "Log Checkpoint" to begin</div>
      </div>
    `;
    logList.appendChild(noLogs);
  }
}

function formatTime(ms) {
  if (!ms && ms !== 0) return "N/A";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function updateEnhancedLeaderboard() {
  const tableBody = document.getElementById("leaderboard");
  if (!tableBody) return;

  checkpointData = JSON.parse(localStorage.getItem("checkpointData")) || {};

  const searchQuery = document.getElementById("searchLeaderboard")?.value.trim().toLowerCase() || "";
  tableBody.innerHTML = "";
  leaderboard = [];

  for (let runner in checkpointData) {
    if (searchQuery && !runner.toLowerCase().includes(searchQuery) && !checkpointData[runner].name.toLowerCase().includes(searchQuery)) continue;

    const data = checkpointData[runner].checkpoints;
    const name = checkpointData[runner].name;
    const completedCheckpoints = data.map(e => e.checkpoint);
    const start = data.find(e => e.checkpoint === "Start");
    const finish = data.find(e => e.checkpoint === "Finish");

    let timeTaken = finish && start ? finish.timestamp - start.timestamp : null;

    let lastCheckpointData = data.length > 0 ? data[data.length - 1] : null;
    let lastCheckpoint = lastCheckpointData ? lastCheckpointData.checkpoint : "None";
    let lastTimestamp = lastCheckpointData ? lastCheckpointData.timestamp : null;

    leaderboard.push({
      runner,
      name,
      timeTaken,
      data,
      completedCheckpoints,
      lastCheckpoint,
      lastTimestamp
    });
  }

  leaderboard.sort((a, b) => {
    const aStatus = checkpointData[a.runner].status || (a.completedCheckpoints.includes("Finish") ? "finished" : a.completedCheckpoints.length > 0 ? "in-progress" : "dnf");
    const bStatus = checkpointData[b.runner].status || (b.completedCheckpoints.includes("Finish") ? "finished" : b.completedCheckpoints.length > 0 ? "in-progress" : "dnf");

    if (aStatus === "dns" && bStatus !== "dns") return 1;
    if (bStatus === "dns" && aStatus !== "dns") return -1;
    if (aStatus === "dns" && bStatus === "dns") return a.runner.localeCompare(b.runner);

    if (aStatus === "finished" && bStatus === "finished") {
      return (a.timeTaken ?? Infinity) - (b.timeTaken ?? Infinity);
    }

    if (aStatus === "finished") return -1;
    if (bStatus === "finished") return 1;

    if (aStatus === "dnf" && bStatus !== "dnf") return 1;
    if (bStatus === "dnf" && aStatus !== "dnf") return -1;
    if (aStatus === "dnf" && bStatus === "dnf") return a.runner.localeCompare(b.runner);

    const aProgress = a.completedCheckpoints.length;
    const bProgress = b.completedCheckpoints.length;

    if (aProgress !== bProgress) {
      return bProgress - aProgress;
    }

    return (a.lastTimestamp ?? Infinity) - (b.lastTimestamp ?? Infinity);
  });

  if (leaderboard.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-table">
          <div class="empty-message">
            <i class="fas fa-clipboard-list"></i>
            <p>No runner data available${searchQuery ? ' for "' + searchQuery + '"' : ' yet'}.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  leaderboard.forEach((entry, index) => {
    const row = document.createElement("tr");
    row.classList.add("fade-in");

    if (index < 3 && !checkpointData[entry.runner].status && entry.completedCheckpoints.includes("Finish")) {
      row.classList.add("rank-" + (index + 1));
    }

    let status = checkpointData[entry.runner].status || (entry.completedCheckpoints.includes("Finish") ? "finished" : entry.completedCheckpoints.length > 0 ? "in-progress" : "dnf");
    const statusIcon = getStatusIcon(status);
    let badge = `<span class="badge status-badge ${status}"><i class="fas ${statusIcon}"></i> ${status.toUpperCase()}</span>`;

    const progressCount = entry.completedCheckpoints.length;
    const progressPercent = Math.round((progressCount / checkpoints.length) * 100);
    const progressHTML = `<div class="progress-container"><div class="progress-bar" style="width: ${progressPercent}%"></div><span>${progressPercent}% (${progressCount}/${checkpoints.length})</span></div>`;

    let time = entry.timeTaken ? formatTime(entry.timeTaken) : "N/A";
    let lastTime = entry.lastTimestamp ? formatTimestamp(entry.lastTimestamp) : "N/A";

    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${entry.runner}</td>
      <td>${entry.name}</td>
      <td>${time}</td>
      <td>${badge}</td>
      <td>${progressHTML}</td>
      <td>${entry.lastCheckpoint}</td>
      <td>${lastTime}</td>
    `;
    tableBody.appendChild(row);
  });
}

function resetData() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (confirm("Are you sure you want to reset all data? This cannot be undone.")) {
    localStorage.removeItem("checkpointData");
    localStorage.removeItem("importedRunnerIDs");
    localStorage.removeItem("raceEventName");
    checkpointData = {};
    showNotification("All data has been reset", "info");

    displayCheckpointLog();
    updateEnhancedLeaderboard();
    displayRaceEventName();
    setupRunnerAutocomplete();
  }
}

function exportToCSV() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (Object.keys(checkpointData).length === 0) {
    showNotification("No data to export", "warning");
    return;
  }

  let csvContent = "Runner ID,Runner Name,Checkpoint,Timestamp,Time(Local),Split Time,Status\n";

  for (let runner in checkpointData) {
    const checkpoints = checkpointData[runner].checkpoints;
    const name = checkpointData[runner].name.replace(/"/g, '""');
    const status = checkpointData[runner].status || (checkpoints.some(entry => entry.checkpoint === "Finish") ? "finished" : checkpoints.length > 0 ? "in-progress" : "dnf");

    if (checkpoints.length === 0) {
      csvContent += `${runner},"${name}","","","","","${status}"\n`;
    } else {
      checkpoints.forEach((entry, index) => {
        const localTime = new Date(entry.timestamp).toLocaleString();
        let splitTime = "N/A";
        if (index > 0) {
          const previousTimestamp = checkpoints[index - 1].timestamp;
          const currentTimestamp = entry.timestamp;
          splitTime = formatTime(currentTimestamp - previousTimestamp);
        } else if (entry.checkpoint === "Start") {
          splitTime = formatTime(0);
        }
        csvContent += `${runner},"${name}","${entry.checkpoint}",${entry.timestamp},"${localTime}","${splitTime}","${status}"\n`;
      });
    }
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `runner_checkpoint_data_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showNotification("Data exported successfully!", "success");
}

function importRunnerData(files) {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (files.length === 0) return;

  const file = files[0];
  const reader = new FileReader();

  reader.onload = function(e) {
    const contents = e.target.result;

    if (file.name.endsWith('.csv')) {
      processCSVImport(contents);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      showNotification("Please save your Excel file as CSV and try again", "info");
    }
  };

  reader.onerror = function() {
    showNotification("Error reading file", "error");
  };

  reader.readAsText(file);
}

function processCSVImport(csvData) {
  if (!isAuthenticated) return;

  const lines = csvData.split('\n');
  if (lines.length <= 1) {
    showNotification("No data found in the file", "error");
    return;
  }

  const headers = lines[0].split(',');

  const runnerIdIndex = headers.findIndex(h => h.toLowerCase().includes('runner') && h.toLowerCase().includes('id'));
  const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name'));

  if (runnerIdIndex === -1) {
    showNotification("Missing required 'Runner ID' column in CSV", "error");
    return;
  }

  let importCount = 0;
  let runnerIDs = {};

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = parseCSVLine(lines[i]);
    if (values.length <= runnerIdIndex) continue;

    const runnerId = values[runnerIdIndex].trim();
    const name = nameIndex !== -1 && values[nameIndex] ? values[nameIndex].trim() : "Unknown";

    if (runnerId && !runnerIDs[runnerId]) {
      runnerIDs[runnerId] = true;
      if (!checkpointData[runnerId]) {
        checkpointData[runnerId] = {
          name: name,
          checkpoints: [],
          status: null
        };
      } else {
        checkpointData[runnerId].name = name;
      }
      importCount++;
    }
  }

  localStorage.setItem("checkpointData", JSON.stringify(checkpointData));
  localStorage.setItem("importedRunnerIDs", JSON.stringify(Object.keys(runnerIDs)));

  showNotification(`Successfully imported ${importCount} runners`, "success");

  setupRunnerAutocomplete();
  displayCheckpointLog();
  updateEnhancedLeaderboard();
}

function parseCSVLine(line) {
  const result = [];
  let startPos = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(line.substring(startPos, i).replace(/^"|"$/g, ''));
      startPos = i + 1;
    }
  }

  result.push(line.substring(startPos).replace(/^"|"$/g, ''));
  return result;
}

function setupRunnerAutocomplete() {
  if (!isAuthenticated) return;

  const inputs = [
    document.getElementById("runnerId"),
    document.getElementById("statusRunnerId")
  ].filter(input => input);

  const importedRunnerIDs = JSON.parse(localStorage.getItem("importedRunnerIDs") || "[]");
  if (importedRunnerIDs.length === 0) return;

  let datalist = document.getElementById("runnerIdList");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "runnerIdList";
    document.body.appendChild(datalist);
  }

  datalist.innerHTML = "";

  importedRunnerIDs.forEach(id => {
    const option = document.createElement("option");
    option.value = id;
    datalist.appendChild(option);
  });

  inputs.forEach(input => {
    input.setAttribute("list", "runnerIdList");
  });
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  updateThemeToggleIcon();
}

function updateThemeToggleIcon() {
  const themeToggle = document.querySelector(".theme-toggle i");
  if (!themeToggle) return;

  const isDark = document.body.classList.contains("dark");
  themeToggle.className = isDark ? "fas fa-sun" : "fas fa-moon";
}

function saveRaceEventName() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const raceEventNameInput = document.getElementById("raceEventName");
  const raceEventName = raceEventNameInput.value.trim();

  if (!raceEventName) {
    showNotification("Please enter a race event name", "error");
    return;
  }

  localStorage.setItem("raceEventName", raceEventName);
  showNotification(`Race event name "${raceEventName}" saved`, "success");
  raceEventNameInput.value = "";
  displayRaceEventName();
}

function displayRaceEventName() {
  const raceEventName = localStorage.getItem("raceEventName") || "Not Set";
  const elements = [
    document.getElementById("currentRaceEventName"),
    document.getElementById("leaderboardRaceEventName"),
    document.getElementById("settingsRaceEventName"),
    document.getElementById("currentEventDisplay") // For settings page section
  ].filter(el => el);

  elements.forEach(element => {
    element.textContent = raceEventName;
    element.title = raceEventName; // Add tooltip for long names
  });
}

function addCheckpoint() {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  const checkpointNameInput = document.getElementById("checkpointName");
  const checkpointName = checkpointNameInput.value.trim();

  if (!checkpointName) {
    showNotification("Please enter a checkpoint name", "error");
    return;
  }

  if (checkpoints.includes(checkpointName)) {
    showNotification("Checkpoint name already exists", "error");
    return;
  }

  checkpoints.splice(checkpoints.length - 1, 0, checkpointName);
  localStorage.setItem("checkpoints", JSON.stringify(checkpoints));
  showNotification(`Checkpoint "${checkpointName}" added`, "success");
  checkpointNameInput.value = "";
  displayCheckpointList();
}

function deleteCheckpoint(checkpoint) {
  if (!isAuthenticated) {
    showNotification("Admin access required", "error");
    return;
  }

  if (checkpoint === "Start" || checkpoint === "Finish") {
    showNotification("Cannot delete Start or Finish checkpoints", "error");
    return;
  }

  if (confirm(`Are you sure you want to delete "${checkpoint}"? This will remove it from all runner data.`)) {
    checkpoints = checkpoints.filter(cp => cp !== checkpoint);
    localStorage.setItem("checkpoints", JSON.stringify(checkpoints));

    for (let runner in checkpointData) {
      checkpointData[runner].checkpoints = checkpointData[runner].checkpoints.filter(
        entry => entry.checkpoint !== checkpoint
      );
    }
    localStorage.setItem("checkpointData", JSON.stringify(checkpointData));

    showNotification(`Checkpoint "${checkpoint}" deleted`, "success");
    displayCheckpointList();
    displayCheckpointLog();
    updateEnhancedLeaderboard();
  }
}

function displayCheckpointList() {
  if (!isAuthenticated) return;

  const checkpointList = document.getElementById("checkpointList");
  if (!checkpointList) return;

  checkpointList.innerHTML = "";

  if (checkpoints.length === 0) {
    let noCheckpoints = document.createElement("li");
    noCheckpoints.classList.add("log-item");
    noCheckpoints.innerHTML = `
      <div class="log-item-icon">
        <i class="fas fa-info-circle"></i>
      </div>
      <div class="log-item-content">
        <div class="log-item-title">No checkpoints defined</div>
        <div class="log-item-time">Add a checkpoint to begin</div>
      </div>
    `;
    checkpointList.appendChild(noCheckpoints);
    return;
  }

  const hasDeletableCheckpoints = checkpoints.some(cp => cp !== "Start" && cp !== "Finish");

  if (!hasDeletableCheckpoints) {
    let noDeletable = document.createElement("li");
    noDeletable.classList.add("log-item");
    noDeletable.innerHTML = `
      <div class="log-item-icon">
        <i class="fas fa-info-circle"></i>
      </div>
      <div class="log-item-content">
        <div class="log-item-title">Only Start and Finish checkpoints exist</div>
        <div class="log-item-time">Add custom checkpoints to enable deletion</div>
      </div>
    `;
    checkpointList.appendChild(noDeletable);
  }

  checkpoints.forEach((checkpoint, index) => {
    let listItem = document.createElement("li");
    listItem.classList.add("fade-in", "log-item");

    const icon = getCheckpointIcon(checkpoint);
    const isImmutable = checkpoint === "Start" || checkpoint === "Finish";
    const deleteButton = isImmutable
      ? `<span class="immutable-label">Permanent</span>`
      : `<button class="danger" onclick="deleteCheckpoint('${checkpoint}')"><i class="fas fa-trash"></i> Delete</button>`;

    listItem.innerHTML = `
      <div class="log-item-icon">
        <i class="fas ${icon}"></i>
      </div>
      <div class="log-item-content">
        <div class="log-item-title">${checkpoint}</div>
        <div class="log-item-time">Position: ${index + 1}</div>
      </div>
      ${deleteButton}
    `;

    checkpointList.appendChild(listItem);
  });
}