"use strict";
(function () {
  const cards = Array.from(document.querySelectorAll('[data-hotel-choice-card]'));
  function choose(card, updateAddress) {
    cards.forEach(item => {
      const selected = item === card;
      item.classList.toggle('selected', selected);
      const button = item.querySelector('[data-hotel-choice]');
      if (button) { button.setAttribute('aria-pressed', String(selected)); button.textContent = selected ? 'Избран хотел' : 'Предпочитам този хотел'; }
      const badge = item.querySelector('.option-badge');
      if (badge) badge.textContent = selected ? 'Вашият хотел' : 'Хотелска опция';
    });
    document.querySelectorAll('[data-client-price]').forEach(item => { item.textContent = card.dataset.clientPrice; });
    document.querySelectorAll('[data-selected-hotel-pdf]').forEach(link => {
      const url = new URL(link.href, window.location.href);
      url.searchParams.set('selectedHotelId', card.dataset.hotelId);
      url.searchParams.set('mode', 'selected');
      link.href = url.href;
    });
    if (updateAddress) {
      const url = new URL(window.location.href);
      url.searchParams.set('selectedHotelId', card.dataset.hotelId);
      window.history.replaceState(null, '', url.href);
    }
  }
  cards.forEach(card => card.querySelector('[data-hotel-choice]')?.addEventListener('click', () => choose(card, true)));
  const selectedId = new URL(window.location.href).searchParams.get('selectedHotelId');
  const selected = cards.find(card => card.dataset.hotelId === selectedId);
  if (selected) choose(selected, false);
})();
