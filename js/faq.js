// FAQ (index.html, .faq) : chaque question est un bouton ; un clic ouvre sa réponse en tiroir (css : la rangée de la
// réponse passe de 0fr à 1fr, en douceur) et la referme au second clic. Plusieurs réponses peuvent être ouvertes.
(() => {
  for (const q of document.querySelectorAll('.faq__q')) {
    q.addEventListener('click', () => {
      const open = q.getAttribute('aria-expanded') !== 'true';
      q.setAttribute('aria-expanded', String(open));
      q.closest('.faq__item').classList.toggle('is-open', open);
    });
  }
})();
