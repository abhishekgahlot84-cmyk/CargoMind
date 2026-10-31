/**
 * CargoMind Logistics City & Hub Alias Database.
 * Maps airport IATA codes, Indian Railways station codes, common short-forms,
 * and colonial/alternate city names to geocoded coordinates.
 */

export const CITY_ALIASES = [
  {
    name: "Gwalior",
    state: "Madhya Pradesh",
    country: "India",
    aliases: ["gwl", "gwalior", "gwalior junction", "gwalior mp"],
    latitude: 26.2183,
    longitude: 78.1828,
    importance: 85,
    place_id: "ChIJn0j_6v4FfzkRsmfLpY0pLhI",
    hub_type: "Logistics Hub",
  },
  {
    name: "Mumbai",
    state: "Maharashtra",
    country: "India",
    aliases: ["bom", "bby", "mumbai", "bombay", "cstm", "bct", "navimumbai", "mumbai terminal"],
    latitude: 19.076,
    longitude: 72.8777,
    importance: 100,
    place_id: "ChIJwe1EZjDG5zsRaYxkjYvpHyo",
    hub_type: "Major Port & Metro",
  },
  {
    name: "Delhi (NCR)",
    state: "Delhi",
    country: "India",
    aliases: ["del", "ndls", "dli", "delhi", "new delhi", "ncr", "noida", "gurugram", "gurgaon", "anvt"],
    latitude: 28.6139,
    longitude: 77.209,
    importance: 100,
    place_id: "ChIJfUQU2AH_DDkRjG7k4wzE1h8",
    hub_type: "National Logistics Center",
  },
  {
    name: "Bengaluru",
    state: "Karnataka",
    country: "India",
    aliases: ["blr", "sbc", "ypr", "bangalore", "bengaluru", "bengaluru tech park"],
    latitude: 12.9716,
    longitude: 77.5946,
    importance: 95,
    place_id: "ChIJbU60yXAWrjsR4E9-Ule3vno",
    hub_type: "Tech & E-commerce Hub",
  },
  {
    name: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    aliases: ["maa", "mas", "ms", "chennai", "madras", "chennai port"],
    latitude: 13.0827,
    longitude: 80.2707,
    importance: 95,
    place_id: "ChIJmQvf-Z5UnTsRM0dQmsZZm-U",
    hub_type: "Automotive & Maritime Port",
  },
  {
    name: "Kolkata",
    state: "West Bengal",
    country: "India",
    aliases: ["ccu", "hwh", "sdah", "kolkata", "calcutta", "howrah"],
    latitude: 22.5726,
    longitude: 88.3639,
    importance: 95,
    place_id: "ChIJZ_EkG3FxAjoRymnguT0Bv4U",
    hub_type: "Eastern Freight Gateway",
  },
  {
    name: "Hyderabad",
    state: "Telangana",
    country: "India",
    aliases: ["hyd", "sc", "kcg", "hyderabad", "secunderabad"],
    latitude: 17.385,
    longitude: 78.4867,
    importance: 90,
    place_id: "ChIJx9Lr6tqZyzsRw0WWI4s1n0Y",
    hub_type: "Pharma & Industrial Hub",
  },
  {
    name: "Pune",
    state: "Maharashtra",
    country: "India",
    aliases: ["pnq", "pune", "poona", "chakan", "bhosari"],
    latitude: 18.5204,
    longitude: 73.8567,
    importance: 90,
    place_id: "ChIJR3t3_m_AwjsRtuiX_A4qMnc",
    hub_type: "Auto Corridor Hub",
  },
  {
    name: "Jaipur",
    state: "Rajasthan",
    country: "India",
    aliases: ["jai", "jp", "jaipur", "pinkcity"],
    latitude: 26.9124,
    longitude: 75.7873,
    importance: 85,
    place_id: "ChIJ-2XLvi-xbTkRik6448D-VnU",
    hub_type: "Northwestern Freight Depot",
  },
  {
    name: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    aliases: ["amd", "adi", "ahmedabad", "sanand"],
    latitude: 23.0225,
    longitude: 72.5714,
    importance: 90,
    place_id: "ChIJSdRWh0KGXjkRqArrzTT3i44",
    hub_type: "Chemical & Textile Logistics",
  },
  {
    name: "Surat",
    state: "Gujarat",
    country: "India",
    aliases: ["st", "surat", "surat diamond"],
    latitude: 21.1702,
    longitude: 72.8311,
    importance: 85,
    place_id: "ChIJ9Wq7Jv1A4DsR-Zk49F8zQkY",
    hub_type: "Industrial Corridor",
  },
  {
    name: "Lucknow",
    state: "Uttar Pradesh",
    country: "India",
    aliases: ["lko", "ljn", "lucknow", "lko hub"],
    latitude: 26.8467,
    longitude: 80.9462,
    importance: 80,
    place_id: "ChIJp0xV8_kKmzkRuZ9cR_h8o7s",
    hub_type: "Central UP Hub",
  },
  {
    name: "Kanpur",
    state: "Uttar Pradesh",
    country: "India",
    aliases: ["cnb", "kanpur", "cawnpore"],
    latitude: 26.4499,
    longitude: 80.3319,
    importance: 80,
    place_id: "ChIJ1Z2i4qCdmzkRZp357Rz8Pso",
    hub_type: "Manufacturing & Leather Hub",
  },
  {
    name: "Indore",
    state: "Madhya Pradesh",
    country: "India",
    aliases: ["idr", "indb", "indore", "pithampur"],
    latitude: 22.7196,
    longitude: 75.8577,
    importance: 85,
    place_id: "ChIJn0j_6v4FfzkRsmfLpY0pLhX",
    hub_type: "Central India Distribution",
  },
  {
    name: "Bhopal",
    state: "Madhya Pradesh",
    country: "India",
    aliases: ["bpl", "rkmp", "bhopal", "rani kamlapati"],
    latitude: 23.2599,
    longitude: 77.4126,
    importance: 80,
    place_id: "ChIJ8Tu0Y9BafzkRkSg2n9wK1bA",
    hub_type: "Heavy Engineering Depot",
  },
  {
    name: "Patna",
    state: "Bihar",
    country: "India",
    aliases: ["pat", "pnbe", "patna"],
    latitude: 25.5941,
    longitude: 85.1376,
    importance: 80,
    place_id: "ChIJ068Wc6pC8jkRu96tFvG13z0",
    hub_type: "Eastern Hub",
  },
  {
    name: "Varanasi",
    state: "Uttar Pradesh",
    country: "India",
    aliases: ["vns", "bsb", "ddu", "varanasi", "banaras", "kashi", "mughalsarai"],
    latitude: 25.3176,
    longitude: 82.9739,
    importance: 80,
    place_id: "ChIJvR1cR0BfkzkRs00j5a9L61E",
    hub_type: "Rail & Road Junction",
  },
  {
    name: "Agra",
    state: "Uttar Pradesh",
    country: "India",
    aliases: ["agr", "agc", "af", "agra", "agra cantt"],
    latitude: 27.1767,
    longitude: 78.0081,
    importance: 80,
    place_id: "ChIJy-T1kXNldDkR66sC-1p8U0U",
    hub_type: "North Corridor Junction",
  },
  {
    name: "Chandigarh",
    state: "Punjab / Haryana",
    country: "India",
    aliases: ["ixc", "cdg", "chandigarh", "mohali", "panchkula"],
    latitude: 30.7333,
    longitude: 76.7794,
    importance: 85,
    place_id: "ChIJmZ2j9Z9WDTkRJ1M9H3y8y7o",
    hub_type: "Northern Industrial Hub",
  },
  {
    name: "Kochi",
    state: "Kerala",
    country: "India",
    aliases: ["cok", "ers", "kochi", "cochin", "ernakulam"],
    latitude: 9.9312,
    longitude: 76.2673,
    importance: 80,
    place_id: "ChIJW2x9qD3yBzsRtY87k1f6Qks",
    hub_type: "Southern Maritime Hub",
  },
  {
    name: "Nagpur",
    state: "Maharashtra",
    country: "India",
    aliases: ["nag", "ngp", "nagpur", "mihan"],
    latitude: 21.1458,
    longitude: 79.0882,
    importance: 90,
    place_id: "ChIJbXlD88rB1DsRHx0hEwG9G_8",
    hub_type: "Zero Mile Multi-Modal Logistics",
  },
  {
    name: "Jhansi",
    state: "Uttar Pradesh",
    country: "India",
    aliases: ["jhs", "vglb", "jhansi", "virangana lakshmibai"],
    latitude: 25.4484,
    longitude: 78.5685,
    importance: 75,
    place_id: "ChIJr14fTf_qfzkR3F5rCg8u6Jc",
    hub_type: "North-South Corridor Relay Hub",
  },
  {
    name: "Jabalpur",
    state: "Madhya Pradesh",
    country: "India",
    aliases: ["jbp", "jabalpur"],
    latitude: 23.1815,
    longitude: 79.9864,
    importance: 75,
    place_id: "ChIJL3iE_N2NfzkRw4Q9c7V8m70",
    hub_type: "Defense & Mineral Logistics",
  },
  {
    name: "Raipur",
    state: "Chhattisgarh",
    country: "India",
    aliases: ["rpr", "raipur", "bhilai"],
    latitude: 21.2514,
    longitude: 81.6296,
    importance: 75,
    place_id: "ChIJd8lJ89e_pTsRXg_sN6wWb_Q",
    hub_type: "Steel & Power Logistics",
  },
  {
    name: "Ranchi",
    state: "Jharkhand",
    country: "India",
    aliases: ["ixr", "rnc", "ranchi", "jamshedpur", "jsr"],
    latitude: 23.3441,
    longitude: 85.3096,
    importance: 75,
    place_id: "ChIJS5D43U1C8jkRX03uQ6p5x_w",
    hub_type: "Mining & Heavy Industry",
  },
  {
    name: "Bhubaneswar",
    state: "Odisha",
    country: "India",
    aliases: ["bbi", "bbs", "bhubaneswar", "cuttack"],
    latitude: 20.2961,
    longitude: 85.8245,
    importance: 75,
    place_id: "ChIJx2V7K513PDoR6E6_kC8pM7g",
    hub_type: "East Coast Terminal",
  },
  {
    name: "Visakhapatnam",
    state: "Andhra Pradesh",
    country: "India",
    aliases: ["vtz", "vskp", "visakhapatnam", "vizag"],
    latitude: 17.6868,
    longitude: 83.2185,
    importance: 85,
    place_id: "ChIJK0tD66x7NToRZfP7J2q3i3U",
    hub_type: "Major Deepwater Port",
  },
  {
    name: "Vadodara",
    state: "Gujarat",
    country: "India",
    aliases: ["bdq", "brc", "vadodara", "baroda"],
    latitude: 22.3072,
    longitude: 73.1812,
    importance: 80,
    place_id: "ChIJ8w4C74iPXjkR9eF1A6HwF0k",
    hub_type: "Petrochemical Logistics",
  },
];

/**
 * Searches the city alias table and returns matches ranked by:
 * 1. Exact alias match (e.g. "GWL" -> Gwalior)
 * 2. Prefix match on alias/code
 * 3. Prefix match on city name
 * 4. Fuzzy/substring match on city or state
 * 5. Preference bonus for previously used locations
 */
export function searchCityAliases(inputQuery) {
  if (!inputQuery || typeof inputQuery !== "string") return [];
  const query = inputQuery.trim().toLowerCase();
  if (query.length < 1) return [];

  // Load recently selected places from localStorage
  let recentPlaceIds = new Set();
  try {
    const raw = localStorage.getItem("cargomind_recent_places");
    if (raw) {
      const arr = JSON.parse(raw);
      recentPlaceIds = new Set(arr.map((p) => p.name?.toLowerCase()));
    }
  } catch {
    // Ignore storage parse errors
  }

  const scored = [];

  for (const city of CITY_ALIASES) {
    let bestScore = 0;
    let matchType = "";

    // 1. Exact alias match
    for (const alias of city.aliases) {
      if (alias === query) {
        bestScore = Math.max(bestScore, 1000 + city.importance);
        matchType = `Exact Code Match (${alias.toUpperCase()})`;
      } else if (alias.startsWith(query)) {
        bestScore = Math.max(bestScore, 700 + city.importance);
        if (!matchType) matchType = `Code Prefix (${alias.toUpperCase()})`;
      } else if (alias.includes(query)) {
        bestScore = Math.max(bestScore, 400 + city.importance);
        if (!matchType) matchType = `Alias Match (${alias})`;
      }
    }

    // 2. City name prefix
    const cityNameLower = city.name.toLowerCase();
    if (cityNameLower === query) {
      bestScore = Math.max(bestScore, 950 + city.importance);
      matchType = "Exact City Match";
    } else if (cityNameLower.startsWith(query)) {
      bestScore = Math.max(bestScore, 650 + city.importance);
      if (!matchType) matchType = "City Prefix";
    } else if (cityNameLower.includes(query)) {
      bestScore = Math.max(bestScore, 350 + city.importance);
      if (!matchType) matchType = "Partial Match";
    }

    // State match
    if (city.state.toLowerCase().includes(query)) {
      bestScore = Math.max(bestScore, 300 + city.importance);
      if (!matchType) matchType = `State Match (${city.state})`;
    }

    // Boost if previously used
    if (recentPlaceIds.has(cityNameLower)) {
      bestScore += 150;
    }

    if (bestScore > 0) {
      scored.push({
        score: bestScore,
        matchType,
        item: {
          id: city.place_id || `alias_${city.name.toLowerCase()}`,
          mainText: city.name,
          secondaryText: `${city.state}, ${city.country} • ${city.hub_type}`,
          fullAddress: `${city.name}, ${city.state}, ${city.country}`,
          latitude: city.latitude,
          longitude: city.longitude,
          lat: city.latitude,
          lon: city.longitude,
          place_id: city.place_id,
          isAlias: true,
          matchBadge: matchType,
        },
      });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map((s) => s.item);
}

/**
 * Record a selected place to local history for future ranking bias.
 */
export function recordRecentPlace(place) {
  if (!place || !place.name) return;
  try {
    const raw = localStorage.getItem("cargomind_recent_places");
    let arr = raw ? JSON.parse(raw) : [];
    arr = arr.filter((p) => p.name?.toLowerCase() !== place.name.toLowerCase());
    arr.unshift({
      name: place.name,
      address: place.address || place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      place_id: place.place_id,
    });
    localStorage.setItem("cargomind_recent_places", JSON.stringify(arr.slice(0, 15)));
  } catch {
    // Ignore storage quota
  }
}
