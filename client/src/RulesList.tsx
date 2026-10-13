export function RulesList() {
  return (
    <ul className="rules">
      <li>You start on your own island with a settlement and a city. The rest of the world is fog: each road, ship or settlement uncovers only the hexes it touches.</li>
      <li>Once you discover another settler, you see everything they have explored — and they see what you have.</li>
      <li>Everyone builds and trades at the same time. The dice roll automatically once every settler presses Done, or when the timer runs out.</li>
      <li>The central chain of islands holds the numbers your island lacks, and 2:1 harbors where you choose the resource.</li>
      <li>Your first settlement on the central chain is worth 2 bonus points, and so is your first settlement on each rival's home island.</li>
      <li>Each island has its own robber. A knight drives yours off for 1 resource, or brings 2 resources of your choice when the robber is away.</li>
      <li>You can only trade with settlers you have discovered. Longest route and largest army are shared on ties.</li>
      <li>Ships move one at a time, every second round, from the open end of a route. Treasures wait in the fog.</li>
      <li>After the last round the most victory points wins; ties go to whoever holds more cards.</li>
    </ul>
  );
}
