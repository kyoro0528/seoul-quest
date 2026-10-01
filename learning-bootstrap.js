(async function () {
  'use strict';
  await window.TopikLearningStorage.ready;
  for (const pending of document.querySelectorAll('script[data-learning-app]')) {
    const script = document.createElement('script');
    if (pending.dataset.learningSrc) {
      script.src = pending.dataset.learningSrc;
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    } else {
      script.textContent = pending.textContent;
      document.body.appendChild(script);
    }
  }
  window.dispatchEvent(new Event('learning-ready'));
})().catch(error => {
  console.error('学習画面の起動に失敗しました', error);
  window.TopikLearningStorage.reportFailure('学習画面を起動できませんでした。再読み込みしてください。');
});
