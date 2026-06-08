const response = $input.first().json;
const contacts = response.contacts || [];

if (contacts.length === 0) {
  return [];
}

/** M = masculin, F = féminin (MME), N = neutre (AUTRE ou civilité absente). */
function genreFromCivilite(civilite) {
  const c = String(civilite || '')
    .trim()
    .toUpperCase();
  if (c === 'MME') return 'F';
  if (c === 'M') return 'M';
  return 'N';
}

function salutation(registre, prenom) {
  return registre === 'TU' ? `Salut ${prenom}` : `Bonjour ${prenom}`;
}

function closing(registre) {
  return registre === 'TU' ? 'à très vite' : 'à bientôt';
}

/** Angle 1 — Valorisation & performance (sourire : MME uniquement). */
function anglePerformance(prenom, registre, genre) {
  const sal = salutation(registre, prenom);
  const end = closing(registre);
  const tu = registre === 'TU';

  if (genre === 'F') {
    if (tu) {
      return `${sal}, joyeux anniversaire ! Si ton sourire et ton expérience étaient un actif financier, le rendement de cette année ferait sauter la banque — ${end}. 📈`;
    }
    return `${sal}, joyeux anniversaire ! Si votre sourire et votre expérience étaient un actif financier, le rendement de cette année ferait sauter la banque — ${end}. 📈`;
  }

  if (tu) {
    return `${sal}, joyeux anniversaire ! Si ton expérience et ta présence étaient un actif financier, le rendement de cette année ferait sauter la banque — ${end}. 📈`;
  }
  return `${sal}, joyeux anniversaire ! Si votre expérience et votre présence étaient un actif financier, le rendement de cette année ferait sauter la banque — ${end}. 📈`;
}

/** Angle 2 — Optimisation & fiscalité (impôt élégance, accord M / F / neutre). */
function angleFiscal(prenom, registre, genre) {
  const sal = salutation(registre, prenom);
  const end = closing(registre);
  const intro =
    "S'il y avait un impôt sur l'élégance qui augmente chaque année, ";
  const tu = registre === 'TU';

  if (tu) {
    if (genre === 'F') {
      return `${sal}, joyeux anniversaire ! ${intro}tu serais lourdement taxée pour cause de surperformance — ${end}. 🥂`;
    }
    if (genre === 'M') {
      return `${sal}, joyeux anniversaire ! ${intro}tu serais lourdement taxé pour cause de surperformance — ${end}. 🥂`;
    }
    return `${sal}, joyeux anniversaire ! ${intro}ta surperformance te placerait dans la tranche la plus élevée — ${end}. 🥂`;
  }

  if (genre === 'F') {
    return `${sal}, joyeux anniversaire ! ${intro}vous seriez lourdement taxée pour cause de surperformance — ${end}. 🥂`;
  }
  if (genre === 'M') {
    return `${sal}, joyeux anniversaire ! ${intro}vous seriez lourdement taxé pour cause de surperformance — ${end}. 🥂`;
  }
  return `${sal}, joyeux anniversaire ! ${intro}votre surperformance vous placerait dans la tranche la plus élevée — ${end}. 🥂`;
}

/** Angle 3 — Capital sympathie exonéré (M / MME uniquement). */
function angleSympathie(prenom, registre, genre) {
  const sal = salutation(registre, prenom);
  const end = closing(registre);
  const tu = registre === 'TU';
  const intro =
    "Heureusement que le capital sympathie est totalement exonéré d'impôt, car ";

  if (genre === 'F') {
    if (tu) {
      return `${sal}, joyeux anniversaire ! ${intro}ta surperformance de l'année t'aurait rendue lourdement imposable — ${end}. 🎉`;
    }
    return `${sal}, joyeux anniversaire ! ${intro}votre surperformance de l'année vous aurait rendue lourdement imposable — ${end}. 🎉`;
  }

  if (tu) {
    return `${sal}, joyeux anniversaire ! ${intro}ta surperformance de l'année t'aurait rendu lourdement imposable — ${end}. 🎉`;
  }
  return `${sal}, joyeux anniversaire ! ${intro}votre surperformance de l'année vous aurait rendu lourdement imposable — ${end}. 🎉`;
}

/** Angle 4 — Inflation & capital (tous). */
function angleInflation(prenom, registre) {
  const sal = salutation(registre, prenom);
  const end = closing(registre);

  if (registre === 'TU') {
    return `${sal}, joyeux anniversaire ! Si le temps qui passe était soumis à l'inflation, ton énergie et ta bonne humeur resteraient le meilleur moyen de protéger ton capital — ${end}. 🚀`;
  }
  return `${sal}, joyeux anniversaire ! Si le temps qui passe était soumis à l'inflation, votre énergie et votre bonne humeur resteraient le meilleur moyen de protéger votre capital — ${end}. 🚀`;
}

/** Angle 5 — Prestige & valeur (tous). */
function anglePrestige(prenom, registre) {
  const sal = salutation(registre, prenom);
  const end = closing(registre);

  if (registre === 'TU') {
    return `${sal}, joyeux anniversaire ! C'est le propre des très grands investissements : chaque année qui passe ajoute une couche de prestige et de valeur — ${end}. 📈`;
  }
  return `${sal}, joyeux anniversaire ! C'est le propre des très grands investissements : chaque année qui passe ajoute une couche de prestige et de valeur — ${end}. 📈`;
}

/** Angle 6 — Capital temps (tu/vous seulement). */
function angleCapitalTemps(prenom, registre) {
  const sal = salutation(registre, prenom);
  const end = closing(registre);

  if (registre === 'TU') {
    return `${sal}, joyeux anniversaire ! Ton capital temps produit des intérêts composés depuis des années, et aujourd'hui le rendement est juste historique — ${end}. 🎁`;
  }
  return `${sal}, joyeux anniversaire ! Votre capital temps produit des intérêts composés depuis des années, et aujourd'hui le rendement est juste historique — ${end}. 🎁`;
}

function buildAnglePool(genre) {
  const pool = [
    anglePerformance,
    angleFiscal,
    angleCapitalTemps,
    angleInflation,
    anglePrestige,
  ];
  if (genre === 'M' || genre === 'F') {
    pool.push(angleSympathie);
  }
  return pool;
}

return contacts.map((c) => {
  const prenom = (c.prenom || c.displayName || '').trim().split(/\s+/)[0] || 'ami';
  const registre = String(c.registre || 'VOUS').trim().toUpperCase() === 'TU' ? 'TU' : 'VOUS';
  const genre = genreFromCivilite(c.civilite);
  const pool = buildAnglePool(genre);
  const message = pool[Math.floor(Math.random() * pool.length)](prenom, registre, genre);

  return {
    json: {
      id: c.id,
      name: c.displayName || `${c.prenom || ''} ${c.nom || ''}`.trim(),
      prenom,
      nom: c.nom,
      civilite: c.civilite || null,
      categorie: c.categorie,
      registre,
      genre,
      message,
      age: c.age,
      birthDate: c.birthDate,
    },
  };
});
