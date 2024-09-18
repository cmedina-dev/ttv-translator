// ==UserScript==
// @name        TTV Traditional Chinese to English
// @namespace   Violentmonkey Scripts
// @match       *://www.twitch.tv/*
// @grant       GM_xmlhttpRequest
// @version     1.0
// @author      Christian Medina <christianjmedina(at)proton.me>
// @description 9/10/2024, 1:45:46 PM
// ==/UserScript==

// Store a set of hashes as a key-value pair in the form { digest: translatedMessage }
const seenMessages = {};

// Function to translate text using Google Translate API
function translateText(text, sourceLang, targetLang) {
  console.log('Setting translate text');
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`,
            onload: function(response) {
                try {
                    let translation = JSON.parse(response.responseText);
                    if (!translation[0]) {
                      resolve();
                    }
                    let translatedText = translation[0][0][0];
                    resolve(translatedText);
                } catch (error) {
                    reject(error);
                }
            },
            onerror: function(error) {
                reject(error);
            }
        });
    });
}

function setTimeoutPromise(callback, delay, ...args) {
  console.log('Setting timeout promise');
  let timeoutId;
  const promise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      resolve(callback(...args));
    }, delay);
  });
  promise.timeoutId = timeoutId;
  return promise;
}

// Function to translate text fragments in a message
async function translateMessageFragments(messageElement) {
  const textFragments = messageElement.querySelectorAll('.text-fragment');
  for (const fragment of textFragments) {
    const originalText = fragment.textContent.trim();
    if (originalText.length > 0) {
      const translatedText = await translateText(originalText, 'zh-TW', 'en');
      fragment.textContent = translatedText;
    }
  }
}

// Callback function to execute when mutations are observed
const callback = (mutationList, observer) => {
  console.log('Callback firing');
  for (const mutation of mutationList) {
    if (mutation.type !== "childList" || mutation.addedNodes.length === 0) {
      continue;
    }
    if (mutation.addedNodes[0].nodeType === Node.TEXT_NODE) {
      continue;
    }

    const messageElement = mutation.addedNodes[0].querySelector('.video-chat__message, .chat-line__message');
    if (!messageElement) {
      console.log('No element selected');
      console.log(mutation.addedNodes[0]);
      continue;
    }

    let hoverPromise;
    if (!messageElement.getAttribute('enter-listener')) {
      messageElement.addEventListener('mouseenter', async () => {
        console.log('Mouse enter fired');
        hoverPromise = setTimeoutPromise(async () => {
          await translateMessageFragments(messageElement);
        }, 1000);
        messageElement.setAttribute('original-html', messageElement.innerHTML);
        messageElement.setAttribute('enter-listener', true);
      });
    }

    if (!messageElement.getAttribute('leave-listener')) {
      messageElement.addEventListener('mouseleave', () => {
        messageElement.setAttribute('leave-listener', true);
        if (hoverPromise && hoverPromise.timeoutId) {
          clearTimeout(hoverPromise.timeoutId);
        }
        const originalHtml = messageElement.getAttribute('original-html');
        if (originalHtml) {
          messageElement.innerHTML = originalHtml;
        }
      });
    }
  }
};

async function processMessage(ttvMessage) {
  console.log('Processing message');
  try {
    const digest = await digestMessage(ttvMessage);
    const hexDigest = arrayBufferToHex(digest);
    if (!seenMessages[hexDigest]) {
        console.log(hexDigest, ' | ', ttvMessage);
        const translatedMessage = await translateText(ttvMessage, 'zh-TW', 'en');
        seenMessages[hexDigest] = translatedMessage;
        console.log('Translated:', translatedMessage);
    }
    return seenMessages[hexDigest];
  } catch (error) {
      console.error('Error:', error);
      return ttvMessage; // Return original message if translation fails
  }
}

function arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Generate a hash digest to serve as the key for any seen messages
async function digestMessage(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await window.crypto.subtle.digest("SHA-256", data);
    return hash;
}

function beginLoad() {
    const observer = new MutationObserver(callback);
    const targetNode = document.querySelector('.video-chat__message-list-wrapper, .chat-scrollable-area__message-container');
    if (targetNode) {
        observer.observe(targetNode, { childList: true, subtree: true });
    } else {
        console.error('Target node not found');
    }
}

// Twitch's chat DOM node is not immediately present on load, so monitor the body for it
const loadObserver = new MutationObserver(function(mutations) {
    if (document.querySelector('.video-chat__message-list-wrapper, .chat-scrollable-area__message-container')) {
        console.log('Element found, running code');
        beginLoad();
        loadObserver.disconnect();
    }
});

loadObserver.observe(document.body, { childList: true, subtree: true });
