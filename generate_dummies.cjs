const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'public', 'data', 'characters');

const indexFile = path.join(baseDir, 'index.json');
let index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

for (let i = 1; i <= 5; i++) {
  const charId = `dummy${i}`;
  const charName = `Dummy ${i}`;
  
  if (!index.includes(charId)) {
    index.push(charId);
  }

  const charDir = path.join(baseDir, charId);
  if (!fs.existsSync(charDir)) {
    fs.mkdirSync(charDir, { recursive: true });
  }

  const unlockedSkills = [];
  const skills = [];

  // 1 Passive
  const passiveId = `${charId}_passive`;
  unlockedSkills.push(passiveId);
  skills.push({
    id: passiveId,
    name: `Dummy Passive ${i}`,
    type: "PASSIVE",
    chargeCost: 0,
    description: `A dummy passive skill for ${charName}.`,
    actions: []
  });

  // 4 Actives
  for (let j = 1; j <= 4; j++) {
    const activeId = `${charId}_active${j}`;
    unlockedSkills.push(activeId);
    skills.push({
      id: activeId,
      name: `Dummy Active ${i}-${j}`,
      type: "ACTIVE",
      chargeCost: 10 * j,
      baseDamage: 10 * j,
      damageType: "PHYSICAL",
      accuracy: 100,
      includeMoveDamage: false,
      description: `A dummy active skill ${j} for ${charName}.`,
      actions: [],
      icon: "icon_slash"
    });
  }

  // 5 Stacks
  for (let j = 1; j <= 5; j++) {
    const stackId = `${charId}_stack${j}`;
    unlockedSkills.push(stackId);
    skills.push({
      id: stackId,
      name: `Dummy Stack ${i}-${j}`,
      type: "STACK",
      chargeCost: 15 * j,
      baseDamage: 0,
      damageType: "PHYSICAL",
      accuracy: 100,
      includeMoveDamage: true,
      description: `A dummy stack skill ${j} for ${charName}.`,
      actions: [],
      icon: "icon_fury"
    });
  }

  const mainData = {
    id: charId,
    name: charName,
    classType: "DUMMY",
    damageType: "PHYSICAL",
    maxHp: 1000,
    initialHp: 1000,
    maxCharge: 100,
    initialCharge: 0,
    stats: {
      strength: 10,
      endurance: 10,
      power: 10,
      resistance: 10,
      speed: 10,
      accuracy: 100
    },
    portrait: "portrait_warrior",
    unlockedSkills: unlockedSkills,
    loadout: {
      passive: passiveId,
      active: `${charId}_active1`,
      stacks: [`${charId}_stack1`, `${charId}_stack2`, `${charId}_stack3`]
    }
  };

  fs.writeFileSync(path.join(charDir, 'main.json'), JSON.stringify(mainData, null, 2));
  fs.writeFileSync(path.join(charDir, 'skills.json'), JSON.stringify(skills, null, 2));
}

fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
console.log('Dummies generated successfully!');
