(() => {
  const generateButton = document.querySelector('#generate');
  const mascot = document.querySelector('#generate-mascot');
  if (!generateButton) return;

  const voices = [
    './voice/1.mp3',
    './voice/2.mp3'
  ];
  const MAX_VOICE_MS = 2000;
  const mascotPlacements = [
    'mascot-top-left',
    'mascot-top-center',
    'mascot-top-right',
    'mascot-side-left',
    'mascot-side-right'
  ];

  let currentAudio = null;
  let voiceStopTimer = null;
  let mascotTimer = null;
  let lastMascotPlacement = null;

  function randomVoice() {
    if (!voices.length) return null;
    return voices[Math.floor(Math.random() * voices.length)];
  }

  function stopCurrentVoice() {
    clearTimeout(voiceStopTimer);
    voiceStopTimer = null;
    if (!currentAudio) return;
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  function playRandomVoice() {
    const source = randomVoice();
    if (!source) return;

    stopCurrentVoice();

    const audio = new Audio(source);
    currentAudio = audio;
    audio.volume = 0.55;

    audio.addEventListener('ended', () => {
      if (currentAudio !== audio) return;
      clearTimeout(voiceStopTimer);
      voiceStopTimer = null;
      currentAudio = null;
    }, { once: true });

    audio.play().then(() => {
      if (currentAudio !== audio) return;
      voiceStopTimer = setTimeout(() => {
        if (currentAudio !== audio) return;
        audio.pause();
        audio.currentTime = 0;
        currentAudio = null;
        voiceStopTimer = null;
      }, MAX_VOICE_MS);
    }).catch(() => {
      if (currentAudio === audio) currentAudio = null;
    });
  }

  function chooseMascotPlacement() {
    if (!mascotPlacements.length) return null;
    const choices = mascotPlacements.filter((placement) => placement !== lastMascotPlacement);
    const pool = choices.length ? choices : mascotPlacements;
    const placement = pool[Math.floor(Math.random() * pool.length)];
    lastMascotPlacement = placement;
    return placement;
  }

  function showMascot() {
    if (!mascot) return;
    clearTimeout(mascotTimer);
    mascot.classList.remove('is-popping', ...mascotPlacements);
    const placement = chooseMascotPlacement();
    if (placement) mascot.classList.add(placement);
    void mascot.offsetWidth;
    mascot.classList.add('is-popping');
    mascotTimer = setTimeout(() => mascot.classList.remove('is-popping'), 1900);
  }

  generateButton.addEventListener('click', () => {
    playRandomVoice();
    showMascot();
  });
})();
