// main.js - Frontend JavaScript using npm-installed SDK
import { StreamingAvatarApi, Configuration } from '@heygen/streaming-avatar';

// Configuration
// Use relative URL in production (same domain), or user input, or localhost for dev
const BACKEND_URL = () => {
  const input = document.getElementById('backendUrl')?.value.trim();
  if (input) return input;
  // In production (deployed), use relative URL
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return ''; // Relative URL - same domain as frontend
  }
  return 'http://localhost:3002'; // Default for local dev
};

// State
let avatar = null;
let selectedAvatarId = null;
let sessionActive = false;
let stopTimeout = null;

// UI Functions
function showStatus(message, type = 'info') {
  const status = document.getElementById('status');
  if (status) {
    status.className = `status ${type}`;
    status.textContent = message;
  }
  console.log(`[${type.toUpperCase()}]`, message);
}

// API Functions
async function loadAvatars() {
  console.log('loadAvatars called');
  const container = document.getElementById('avatars');
  container.innerHTML = '<div>Loading Interactive Avatars...</div>';
  showStatus('Loading Interactive Avatars...', 'info');

  try {
    // Use /interactive_avatars endpoint which returns ONLY Interactive Avatars
    const response = await fetch(`${BACKEND_URL()}/interactive_avatars`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Extract avatars from response (API structure may vary)
    // v1/streaming/avatar.list returns ONLY Interactive Avatars
    let avatars = result.data?.avatars || 
                  result.data?.data?.avatars ||
                  result.data ||
                  result.avatars || 
                  result || [];
    
    // Ensure it's an array
    if (!Array.isArray(avatars)) {
      avatars = [];
    }
    
    // Log for debugging
    console.log('=== Interactive Avatars Response ===');
    console.log('Total Interactive Avatars:', avatars.length);
    if (avatars.length > 0) {
      console.log('Sample avatar:', avatars[0]);
      console.log('All avatar keys:', Object.keys(avatars[0]));
      console.log('All Interactive Avatar IDs:', avatars.map(a => a.avatar_id || a.avatarName || a.name || JSON.stringify(a)));
    }

    if (avatars.length === 0) {
      container.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <div style="color: #ff9800; font-weight: bold; margin-bottom: 10px;">⚠️ No Interactive Avatars Found</div>
          <div style="font-size: 12px; color: #666;">
            No Interactive Avatars available in your account.<br/>
            Check your HeyGen account or API key.
          </div>
        </div>
      `;
      showStatus('⚠️ No Interactive Avatars found. Check your account or API key.', 'warning');
      return;
    }

    container.innerHTML = '';
    avatars.forEach(avatar => {
      // Handle different response structures
      const avatarId = avatar.avatar_id || avatar.avatarName || avatar.name || avatar.id;
      const avatarName = avatar.name || avatar.avatarName || avatar.avatar_id || avatarId;
      
      if (!avatarId) {
        console.warn('Avatar missing ID:', avatar);
        return;
      }
      
      const card = document.createElement('div');
      card.className = 'card';
      card.style.border = '2px solid #4CAF50';
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => selectAvatar(avatarId, card));
      card.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">${avatarName}</div>
        <div style="font-size: 12px; color: #666; word-break: break-all;">${avatarId}</div>
        <div style="font-size: 11px; color: #4CAF50; margin-top: 4px; font-weight: bold;">✓ Interactive Avatar</div>
      `;
      container.appendChild(card);
    });

    showStatus(`✅ Loaded ${avatars.length} Interactive Avatars - All ready for streaming!`, 'success');
  } catch (error) {
    showStatus(`❌ Error: ${error.message}`, 'error');
    container.innerHTML = '';
    console.error('Load avatars error:', error);
  }
}

function selectAvatar(avatarId, cardElement) {
  console.log('selectAvatar called:', avatarId);
  selectedAvatarId = avatarId;
  document.querySelectorAll('#avatars .card').forEach(c => c.classList.remove('selected'));
  cardElement.classList.add('selected');
  document.getElementById('startBtn').disabled = false;
  showStatus(`✅ Interactive Avatar selected: ${avatarId}`, 'success');
}

async function getStreamingToken() {
  try {
    showStatus('🔄 Getting streaming token from backend...', 'info');
    const response = await fetch(`${BACKEND_URL()}/streaming_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(error.error || 'Failed to get streaming token');
    }

    const result = await response.json();
    console.log('Backend response:', result);
    
    // Try different paths for token extraction
    const token = result.data?.token || result.data?.data?.token || result.token || result.access_token;
    
    if (!token) {
      console.error('Token not found in response. Full response:', result);
      throw new Error('Token not found in response. Check backend response structure.');
    }

    console.log('✅ Token received:', token.substring(0, 20) + '...');
    return token;
  } catch (error) {
    showStatus(`❌ Error getting token: ${error.message}`, 'error');
    throw error;
  }
}

async function startSession() {
  if (!selectedAvatarId) {
    showStatus('Please select an avatar first', 'error');
    return;
  }

  if (sessionActive) {
    showStatus('⚠️ Session already active. Stop current session first.', 'warning');
    return;
  }

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const speakBtn = document.getElementById('speakBtn');
  
  startBtn.disabled = true;
  showStatus('🔄 Initializing session...', 'info');

  try {
    // Get token from backend
    const token = await getStreamingToken();
    
    showStatus('🔄 Creating avatar session...', 'info');

    const videoContainer = document.getElementById('videoContainer');
    videoContainer.className = 'video-container';
    videoContainer.innerHTML = '<div>Connecting to avatar...</div>';

    // Initialize StreamingAvatar SDK (from npm)
    // Note: SDK expects apiKey as function: (name) => string
    // Some endpoints need apiKey, some need accessToken
    avatar = new StreamingAvatarApi(
      new Configuration({ 
        accessToken: token,
        // apiKey can be string, Promise, or function - use function to ensure it works
        apiKey: (name) => token  // Function that returns token for X-API-KEY header
      })
    );

    // Start avatar with 720p quality for free tier
    showStatus('🔄 Starting avatar...', 'info');
    
    // Create session request with proper structure
    // Note: avatarName should be the avatar ID, and voice is optional
    const sessionRequest = {
      newSessionRequest: {
        quality: "low",  // Free tier supports up to 720p (use "low" for free tier)
        avatarName: selectedAvatarId
        // voice is optional - SDK will use default voice if not provided
      }
    };
    
    console.log('Creating session with request:', JSON.stringify(sessionRequest, null, 2));
    console.log('Using token (first 30 chars):', token.substring(0, 30) + '...');
    
    // Intercept fetch to log actual API responses
    const originalFetch = window.fetch;
    let lastApiError = null;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Clone response for logging
      const clonedResponse = response.clone();
      
      // Check if this is the streaming.new API call
      if (args[0] && args[0].includes && args[0].includes('/v1/streaming.new')) {
        console.log('=== Intercepted /v1/streaming.new request ===');
        console.log('Request URL:', args[0]);
        console.log('Request options:', args[1]);
        
        if (!response.ok) {
          try {
            const errorText = await clonedResponse.text();
            console.error('=== API Error Response (400) ===');
            console.error('Status:', response.status);
            console.error('Status Text:', response.statusText);
            console.error('Response Body:', errorText);
            
            try {
              const errorJson = JSON.parse(errorText);
              console.error('Parsed Error:', errorJson);
              lastApiError = errorJson;
            } catch (e) {
              lastApiError = errorText;
            }
          } catch (e) {
            console.error('Could not read error response:', e);
          }
        }
      }
      
      return response;
    };
    
    // Wrap SDK call to handle errors better
    try {
      await avatar.createStartAvatar(sessionRequest);
      
      // Restore original fetch
      window.fetch = originalFetch;
    } catch (apiError) {
      // Restore original fetch
      window.fetch = originalFetch;
      
      // Log detailed error for debugging
      console.error('=== createStartAvatar error ===');
      console.error('Error type:', typeof apiError);
      console.error('Error message:', apiError.message);
      console.error('Error stack:', apiError.stack);
      console.error('Full error object:', apiError);
      
      // Use intercepted API error if available
      let errorMsg = apiError.message;
      
      if (lastApiError) {
        console.error('=== Using intercepted API error ===');
        if (typeof lastApiError === 'object') {
          errorMsg = lastApiError.message || 
                     lastApiError.error?.message ||
                     lastApiError.error ||
                     JSON.stringify(lastApiError);
          
          // Special handling for "not an Interactive Avatar" error
          if (errorMsg.includes('Interactive Avatar') || errorMsg.includes('avatar not found')) {
            errorMsg = `❌ ${errorMsg}\n\n💡 Tip: Only Interactive Avatars work with streaming. Please select an Interactive Avatar from the list.`;
          }
        } else {
          errorMsg = lastApiError;
        }
        errorMsg = `HeyGen API Error (400): ${errorMsg}`;
      } else if (apiError.message && apiError.message.includes('close')) {
        // SDK internal error - API call failed
        errorMsg = `API request failed with 400 Bad Request. Check browser Network tab for details. Original error: ${apiError.message}`;
      }
      
      throw new Error(errorMsg);
    }

    // Wait for mediaStream to be available (WebRTC handles internally)
    showStatus('🔄 Waiting for stream...', 'info');
    let streamCheckInterval = setInterval(() => {
      if (avatar.mediaStream) {
        clearInterval(streamCheckInterval);
        console.log('✅ Stream ready!');
        
        const video = document.createElement('video');
        video.id = 'avatarVideo';
        video.autoplay = true;
        video.playsInline = true;
        video.controls = false;
        video.srcObject = avatar.mediaStream;
        videoContainer.innerHTML = '';
        videoContainer.appendChild(video);
        
        showStatus('✅ Stream ready! Avatar is live.', 'success');
      }
    }, 100);

    // Timeout after 10 seconds if stream doesn't arrive
    setTimeout(() => {
      clearInterval(streamCheckInterval);
      if (!avatar.mediaStream) {
        showStatus('⚠️ Stream timeout. Please try again.', 'warning');
        stopSession();
      }
    }, 10000);

    sessionActive = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    speakBtn.disabled = false;
    showStatus('✅ Session started! You can now speak to avatar.', 'success');

    // Auto-stop after 3 minutes (free tier limit)
    if (stopTimeout) clearTimeout(stopTimeout);
    stopTimeout = setTimeout(() => {
      if (sessionActive) {
        showStatus('⏱️ 3 minute limit reached. Stopping session...', 'warning');
        stopSession();
      }
    }, 180000); // 3 minutes

  } catch (error) {
    console.error('Start session error:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response,
      data: error.response?.data,
      status: error.response?.status
    });
    
    // Extract detailed error message
    let errorMsg = error.message;
    if (error.response?.data) {
      const errorData = typeof error.response.data === 'string' 
        ? error.response.data 
        : JSON.stringify(error.response.data);
      errorMsg = `API Error: ${errorData}`;
    } else if (error.response?.status) {
      errorMsg = `API Error (${error.response.status}): ${error.message}`;
    }
    
    showStatus(`❌ Error: ${errorMsg}`, 'error');
    startBtn.disabled = false;
    sessionActive = false;
    
    // Clean up if avatar instance was created
    if (avatar && avatar.peerConnection) {
      try {
        avatar.peerConnection.close();
      } catch (e) {
        console.error('Error closing peer connection:', e);
      }
    }
    avatar = null;
    
    const videoContainer = document.getElementById('videoContainer');
    videoContainer.className = 'video-container placeholder';
    videoContainer.innerHTML = '<div>Error starting session. Please try again.</div>';
  }
}

async function stopSession() {
  if (!sessionActive || !avatar) {
    return;
  }

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const speakBtn = document.getElementById('speakBtn');

  showStatus('🛑 Stopping session...', 'info');

  try {
    // Clear auto-stop timeout
    if (stopTimeout) {
      clearTimeout(stopTimeout);
      stopTimeout = null;
    }

    // Close avatar session
    if (avatar && typeof avatar.stopAvatar === 'function') {
      try {
        await avatar.stopAvatar({ stopSessionRequest: { sessionId: avatar.sessionId } });
      } catch (error) {
        console.error('Error stopping avatar:', error);
      }
    }
    
    // Close peer connection if exists
    if (avatar && avatar.peerConnection) {
      avatar.peerConnection.close();
    }
    
    // Stop video tracks
    const videoElement = document.getElementById('avatarVideo');
    if (videoElement && videoElement.srcObject) {
      const tracks = videoElement.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoElement.srcObject = null;
    }

    avatar = null;
    sessionActive = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    speakBtn.disabled = true;

    const videoContainer = document.getElementById('videoContainer');
    videoContainer.className = 'video-container placeholder';
    videoContainer.innerHTML = '<div>Video stream will appear here when session starts</div>';

    showStatus('✅ Session stopped.', 'success');
  } catch (error) {
    console.error('Stop session error:', error);
    showStatus(`❌ Error stopping session: ${error.message}`, 'error');
  }
}

async function sendSpeak() {
  if (!sessionActive || !avatar) {
    showStatus('⚠️ Please start a session first', 'warning');
    return;
  }

  const input = document.getElementById('textInput').value.trim();
  if (!input) {
    showStatus('Please enter a question or input', 'error');
    return;
  }

  const speakBtn = document.getElementById('speakBtn');
  speakBtn.disabled = true;
  speakBtn.textContent = '⏳ Getting answer from RAG API...';
  showStatus('Calling RAG API... ⏳', 'info');
  document.getElementById('answerSection').style.display = 'none';

  try {
    // Step 1: Call RAG API
    const ragResponse = await fetch(`${BACKEND_URL()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: input
      })
    });

    const ragResult = await ragResponse.json();
    
    if (!ragResponse.ok) {
      throw new Error(ragResult.error || ragResult.detail || 'RAG API call failed');
    }

    // Extract answer from RAG response
    const answerText = ragResult.message || ragResult.data?.message || 'No answer received';
    
    // Display the answer
    document.getElementById('answerText').textContent = answerText;
    document.getElementById('answerSection').style.display = 'block';
    showStatus('✅ Got answer from RAG API! Now speaking to avatar...', 'success');

    // Step 2: Use answer text to speak to avatar
    speakBtn.textContent = '⏳ Speaking to avatar...';
    
    // Limit text length for free tier (rough estimate)
    let textToSpeak = answerText;
    if (textToSpeak.length > 300) {
      showStatus('⚠️ Answer too long! Truncating to 300 characters for free tier.', 'warning');
      textToSpeak = textToSpeak.substring(0, 300) + '...';
    }

    // Get sessionId from avatar instance (set during createStartAvatar)
    const sessionId = avatar.sessionId;
    
    if (!sessionId) {
      throw new Error('Session ID not found. Please restart the session.');
    }
    
    console.log('Sending speak request with sessionId:', sessionId);
    console.log('Text to speak:', textToSpeak);
    
    await avatar.speak({ 
      taskRequest: { 
        text: textToSpeak,
        sessionId: sessionId  // Include sessionId in TaskRequest
      } 
    });
    showStatus('✅ Answer sent to avatar! Avatar is speaking...', 'success');
    speakBtn.disabled = false;
    speakBtn.textContent = '🤖 Get Answer & Speak';
    
    // Clear input after successful send
    document.getElementById('textInput').value = '';
  } catch (error) {
    console.error('Error:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response,
      status: error.response?.status,
      data: error.response?.data
    });
    
    let errorMsg = error.message;
    if (error.response?.status === 401) {
      errorMsg = 'Unauthorized: Session expired or invalid. Please restart the session.';
    }
    
    showStatus(`❌ Error: ${errorMsg}`, 'error');
    speakBtn.disabled = false;
    speakBtn.textContent = '🤖 Get Answer & Speak';
  }
}

// Setup event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ DOM loaded, setting up event listeners');
  
  const loadBtn = document.getElementById('loadAvatarsBtn');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const speakBtn = document.getElementById('speakBtn');

  if (loadBtn) {
    loadBtn.addEventListener('click', loadAvatars);
    console.log('✅ Load button listener added');
  }

  if (startBtn) {
    startBtn.addEventListener('click', startSession);
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', stopSession);
  }

  if (speakBtn) {
    speakBtn.addEventListener('click', sendSpeak);
  }

  console.log('✅ All event listeners setup complete');
  console.log('Backend URL:', BACKEND_URL());
});

// Export for debugging
window.app = {
  loadAvatars,
  startSession,
  stopSession,
  sendSpeak,
  selectAvatar,
  avatar,
  selectedAvatarId,
  sessionActive
};

