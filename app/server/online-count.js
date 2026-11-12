// Players online right now, counted from open WebSocket connections:
// one per signed-in account (however many tabs it has open), plus one per open guest socket.
export function countOnline(clients) {
  const accounts = new Set();
  let guests = 0;
  for (const client of clients) {
    if (client.readyState !== 1) continue;
    if (client.userId) accounts.add(client.userId);
    else guests += 1;
  }
  return accounts.size + guests;
}
