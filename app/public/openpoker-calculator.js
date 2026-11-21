const entries = document.querySelector('#entries');
const money = (cents) => '$' + (cents / 100).toFixed(2);

function update() {
  const count = Math.max(0, Math.floor(Number(entries.value) || 0));
  document.querySelector('#hostingOut').textContent = money(count * 64);
  document.querySelector('#creatorOut').textContent = money(count * 16);
  document.querySelector('#platformOut').textContent = money(count * 20);
}

entries.addEventListener('input', update);
update();
