// =====================================================
// flag-data.js — Flag definitions for Flagle game
// =====================================================
// Each flag has:
//   name: country name
//   aspectRatio: width/height ratio of the SVG viewBox
//   colorGroups: array of color group objects
//     - id: unique group ID
//     - label: human-readable label (e.g. "Red stripe")
//     - color: { h, s, b } target color in HSB
//     - isGuessable: true for up to 3 groups, false for rest (pre-filled)
//     - paths: SVG path data strings that share this color
//
// Colors are in HSB format to match the existing Chroma scoring system.
// HSB: h=0-360, s=0-1, b=0-1
// =====================================================

// Helper: convert hex to HSB
function hexToHsb(hex) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.slice(0,2),16)/255;
    const g = parseInt(hex.slice(2,4),16)/255;
    const b = parseInt(hex.slice(4,6),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
        if (max === r) h = 60 * (((g-b)/delta) % 6);
        else if (max === g) h = 60 * ((b-r)/delta + 2);
        else h = 60 * ((r-g)/delta + 4);
    }
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : delta/max;
    return { h: Math.round(h*10)/10, s: Math.round(s*1000)/1000, b: Math.round(max*1000)/1000 };
}

// Precomputed HSB values for common flag colors
const COLORS = {
    red:        hexToHsb('#CC0001'),
    darkRed:    hexToHsb('#C60B1E'),
    brightRed:  hexToHsb('#FF0000'),
    crimson:    hexToHsb('#DC143C'),
    orange:     hexToHsb('#FF8200'),
    yellow:     hexToHsb('#FFCC00'),
    gold:       hexToHsb('#FFD700'),
    green:      hexToHsb('#009A44'),
    darkGreen:  hexToHsb('#006600'),
    limeGreen:  hexToHsb('#00A550'),
    blue:       hexToHsb('#003DA5'),
    navyBlue:   hexToHsb('#003087'),
    lightBlue:  hexToHsb('#4997D0'),
    skyBlue:    hexToHsb('#75AADB'),
    royalBlue:  hexToHsb('#0047AB'),
    cerulean:   hexToHsb('#0070B8'),
    cobalt:     hexToHsb('#0038A8'),
    white:      hexToHsb('#FFFFFF'),
    black:      hexToHsb('#1A1A1A'),
    purple:     hexToHsb('#7B2D8B'),
};

const FLAGS = [
    // ─── FRANCE ───────────────────────────────────────────────────────────
    {
        name: 'France',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'fr-blue',
                label: 'Blue stripe',
                color: hexToHsb('#0055A4'),
                isGuessable: true,
                paths: ['M0,0 H100 V150 H0 Z'] // left third
            },
            {
                id: 'fr-white',
                label: 'White stripe',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M100,0 H200 V150 H100 Z']
            },
            {
                id: 'fr-red',
                label: 'Red stripe',
                color: hexToHsb('#EF4135'),
                isGuessable: true,
                paths: ['M200,0 H300 V150 H200 Z']
            }
        ],
        viewBox: '0 0 300 150'
    },

    // ─── GERMANY ──────────────────────────────────────────────────────────
    {
        name: 'Germany',
        aspectRatio: 5/3,
        colorGroups: [
            {
                id: 'de-black',
                label: 'Black stripe',
                color: hexToHsb('#000000'),
                isGuessable: true,
                paths: ['M0,0 H300 V60 H0 Z']
            },
            {
                id: 'de-red',
                label: 'Red stripe',
                color: hexToHsb('#DD0000'),
                isGuessable: true,
                paths: ['M0,60 H300 V120 H0 Z']
            },
            {
                id: 'de-gold',
                label: 'Gold stripe',
                color: hexToHsb('#FFCE00'),
                isGuessable: true,
                paths: ['M0,120 H300 V180 H0 Z']
            }
        ],
        viewBox: '0 0 300 180'
    },

    // ─── ITALY ────────────────────────────────────────────────────────────
    {
        name: 'Italy',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'it-green',
                label: 'Green stripe',
                color: hexToHsb('#009246'),
                isGuessable: true,
                paths: ['M0,0 H100 V150 H0 Z']
            },
            {
                id: 'it-white',
                label: 'White stripe',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M100,0 H200 V150 H100 Z']
            },
            {
                id: 'it-red',
                label: 'Red stripe',
                color: hexToHsb('#CE2B37'),
                isGuessable: true,
                paths: ['M200,0 H300 V150 H200 Z']
            }
        ],
        viewBox: '0 0 300 150'
    },

    // ─── NETHERLANDS ──────────────────────────────────────────────────────
    {
        name: 'Netherlands',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'nl-red',
                label: 'Red stripe',
                color: hexToHsb('#AE1C28'),
                isGuessable: true,
                paths: ['M0,0 H300 V66 H0 Z']
            },
            {
                id: 'nl-white',
                label: 'White stripe',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M0,66 H300 V132 H0 Z']
            },
            {
                id: 'nl-blue',
                label: 'Blue stripe',
                color: hexToHsb('#21468B'),
                isGuessable: true,
                paths: ['M0,132 H300 V200 H0 Z']
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── SPAIN ────────────────────────────────────────────────────────────
    {
        name: 'Spain',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'es-red',
                label: 'Red stripe',
                color: hexToHsb('#C60B1E'),
                isGuessable: true,
                paths: ['M0,0 H300 V50 H0 Z', 'M0,150 H300 V200 H0 Z']
            },
            {
                id: 'es-yellow',
                label: 'Yellow stripe',
                color: hexToHsb('#F1BF00'),
                isGuessable: true,
                paths: ['M0,50 H300 V150 H0 Z']
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── JAPAN ────────────────────────────────────────────────────────────
    {
        name: 'Japan',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'jp-white',
                label: 'White background',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M0,0 H300 V200 H0 Z']
            },
            {
                id: 'jp-red',
                label: 'Red disc',
                color: hexToHsb('#BC002D'),
                isGuessable: true,
                paths: ['M150,100 m-50,0 a50,50 0 1,0 100,0 a50,50 0 1,0 -100,0']
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── SWEDEN ───────────────────────────────────────────────────────────
    {
        name: 'Sweden',
        aspectRatio: 8/5,
        colorGroups: [
            {
                id: 'se-blue',
                label: 'Blue background',
                color: hexToHsb('#006AA7'),
                isGuessable: true,
                paths: [
                    'M0,0 H100 V90 H0 Z',
                    'M160,0 H400 V90 H160 Z',
                    'M0,150 H100 V250 H0 Z',
                    'M160,150 H400 V250 H160 Z'
                ]
            },
            {
                id: 'se-yellow',
                label: 'Yellow cross',
                color: hexToHsb('#FECC02'),
                isGuessable: true,
                paths: [
                    'M100,0 H160 V250 H100 Z',
                    'M0,90 H400 V150 H0 Z'
                ]
            }
        ],
        viewBox: '0 0 400 250'
    },

    // ─── SWITZERLAND ──────────────────────────────────────────────────────
    {
        name: 'Switzerland',
        aspectRatio: 1,
        colorGroups: [
            {
                id: 'ch-red',
                label: 'Red background',
                color: hexToHsb('#FF0000'),
                isGuessable: true,
                paths: ['M0,0 H300 V300 H0 Z']
            },
            {
                id: 'ch-white',
                label: 'White cross',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: [
                    'M120,60 H180 V120 H240 V180 H180 V240 H120 V180 H60 V120 H120 Z'
                ]
            }
        ],
        viewBox: '0 0 300 300'
    },

    // ─── UKRAINE ──────────────────────────────────────────────────────────
    {
        name: 'Ukraine',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'ua-blue',
                label: 'Blue stripe',
                color: hexToHsb('#005BBB'),
                isGuessable: true,
                paths: ['M0,0 H300 V100 H0 Z']
            },
            {
                id: 'ua-yellow',
                label: 'Yellow stripe',
                color: hexToHsb('#FFD500'),
                isGuessable: true,
                paths: ['M0,100 H300 V200 H0 Z']
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── BELGIUM ──────────────────────────────────────────────────────────
    {
        name: 'Belgium',
        aspectRatio: 15/13,
        colorGroups: [
            {
                id: 'be-black',
                label: 'Black stripe',
                color: hexToHsb('#000000'),
                isGuessable: true,
                paths: ['M0,0 H86 V260 H0 Z']
            },
            {
                id: 'be-yellow',
                label: 'Yellow stripe',
                color: hexToHsb('#FAE042'),
                isGuessable: true,
                paths: ['M86,0 H172 V260 H86 Z']
            },
            {
                id: 'be-red',
                label: 'Red stripe',
                color: hexToHsb('#EF3340'),
                isGuessable: true,
                paths: ['M172,0 H260 V260 H172 Z']
            }
        ],
        viewBox: '0 0 260 260'
    },

    // ─── AUSTRIA ──────────────────────────────────────────────────────────
    {
        name: 'Austria',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'at-red',
                label: 'Red stripe',
                color: hexToHsb('#ED2939'),
                isGuessable: true,
                paths: ['M0,0 H300 V67 H0 Z', 'M0,133 H300 V200 H0 Z']
            },
            {
                id: 'at-white',
                label: 'White stripe',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M0,67 H300 V133 H0 Z']
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── DENMARK ──────────────────────────────────────────────────────────
    {
        name: 'Denmark',
        aspectRatio: 28/21,
        colorGroups: [
            {
                id: 'dk-red',
                label: 'Red background',
                color: hexToHsb('#C60C30'),
                isGuessable: true,
                paths: [
                    'M0,0 H112 V84 H0 Z',
                    'M168,0 H336 V84 H168 Z',
                    'M0,120 H112 V252 H0 Z',
                    'M168,120 H336 V252 H168 Z'
                ]
            },
            {
                id: 'dk-white',
                label: 'White cross',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: [
                    'M112,0 H168 V252 H112 Z',
                    'M0,84 H336 V120 H0 Z'
                ]
            }
        ],
        viewBox: '0 0 336 252'
    },

    // ─── NORWAY ───────────────────────────────────────────────────────────
    {
        name: 'Norway',
        aspectRatio: 22/16,
        colorGroups: [
            {
                id: 'no-red',
                label: 'Red background',
                color: hexToHsb('#EF2B2D'),
                isGuessable: true,
                paths: [
                    'M0,0 H110 V100 H0 Z',
                    'M170,0 H330 V100 H170 Z',
                    'M0,150 H110 V240 H0 Z',
                    'M170,150 H330 V240 H170 Z'
                ]
            },
            {
                id: 'no-white',
                label: 'White cross outline',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: [
                    'M110,0 H170 V240 H110 Z',
                    'M0,100 H330 V150 H0 Z'
                ]
            },
            {
                id: 'no-blue',
                label: 'Blue cross',
                color: hexToHsb('#003680'),
                isGuessable: true,
                paths: [
                    'M125,0 H155 V240 H125 Z',
                    'M0,110 H330 V140 H0 Z'
                ]
            }
        ],
        viewBox: '0 0 330 240'
    },

    // ─── FINLAND ──────────────────────────────────────────────────────────
    {
        name: 'Finland',
        aspectRatio: 18/11,
        colorGroups: [
            {
                id: 'fi-white',
                label: 'White background',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: [
                    'M0,0 H110 V95 H0 Z',
                    'M170,0 H360 V95 H170 Z',
                    'M0,145 H110 V220 H0 Z',
                    'M170,145 H360 V220 H170 Z'
                ]
            },
            {
                id: 'fi-blue',
                label: 'Blue cross',
                color: hexToHsb('#003580'),
                isGuessable: true,
                paths: [
                    'M110,0 H170 V220 H110 Z',
                    'M0,95 H360 V145 H0 Z'
                ]
            }
        ],
        viewBox: '0 0 360 220'
    },

    // ─── POLAND ───────────────────────────────────────────────────────────
    {
        name: 'Poland',
        aspectRatio: 8/5,
        colorGroups: [
            {
                id: 'pl-white',
                label: 'White stripe',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M0,0 H320 V100 H0 Z']
            },
            {
                id: 'pl-red',
                label: 'Red stripe',
                color: hexToHsb('#DC143C'),
                isGuessable: true,
                paths: ['M0,100 H320 V200 H0 Z']
            }
        ],
        viewBox: '0 0 320 200'
    },

    // ─── PORTUGAL ─────────────────────────────────────────────────────────
    {
        name: 'Portugal',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'pt-green',
                label: 'Green stripe',
                color: hexToHsb('#006600'),
                isGuessable: true,
                paths: ['M0,0 H120 V200 H0 Z']
            },
            {
                id: 'pt-red',
                label: 'Red stripe',
                color: hexToHsb('#FF0000'),
                isGuessable: true,
                paths: ['M120,0 H300 V200 H120 Z']
            },
            {
                id: 'pt-yellow',
                label: 'Yellow emblem',
                color: hexToHsb('#FFD700'),
                isGuessable: true,
                paths: ['M120,70 m-30,0 a30,30 0 1,0 60,0 a30,30 0 1,0 -60,0']
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── GREECE ───────────────────────────────────────────────────────────
    {
        name: 'Greece',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'gr-blue',
                label: 'Blue stripes & corner',
                color: hexToHsb('#0D5EAF'),
                isGuessable: true,
                paths: [
                    'M0,0 H120 V80 H0 Z',
                    'M0,160 H300 V200 H0 Z',
                    'M0,80 H25 V160 H0 Z',
                    'M0,40 H120 V55 H0 Z',
                    'M0,120 H120 V135 H0 Z'
                ]
            },
            {
                id: 'gr-white',
                label: 'White stripes & cross',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: [
                    'M0,25 H120 V40 H0 Z',
                    'M0,55 H120 V80 H0 Z',
                    'M0,135 H300 V160 H0 Z',
                    'M0,0 H120 V25 H0 Z',
                    'M120,0 H300 V40 H120 Z',
                    'M120,40 H145 V160 H120 Z',
                    'M25,120 H120 V160 H25 Z'
                ]
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── IRELAND ──────────────────────────────────────────────────────────
    {
        name: 'Ireland',
        aspectRatio: 2/1,
        colorGroups: [
            {
                id: 'ie-green',
                label: 'Green stripe',
                color: hexToHsb('#169B62'),
                isGuessable: true,
                paths: ['M0,0 H100 V150 H0 Z']
            },
            {
                id: 'ie-white',
                label: 'White stripe',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M100,0 H200 V150 H100 Z']
            },
            {
                id: 'ie-orange',
                label: 'Orange stripe',
                color: hexToHsb('#FF883E'),
                isGuessable: true,
                paths: ['M200,0 H300 V150 H200 Z']
            }
        ],
        viewBox: '0 0 300 150'
    },

    // ─── CANADA ───────────────────────────────────────────────────────────
    {
        name: 'Canada',
        aspectRatio: 2/1,
        colorGroups: [
            {
                id: 'ca-red',
                label: 'Red panels & maple leaf',
                color: hexToHsb('#FF0000'),
                isGuessable: true,
                paths: [
                    'M0,0 H75 V150 H0 Z',
                    'M225,0 H300 V150 H225 Z',
                    'M150,30 L165,65 L200,65 L170,85 L180,120 L150,100 L120,120 L130,85 L100,65 L135,65 Z'
                ]
            },
            {
                id: 'ca-white',
                label: 'White centre',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M75,0 H225 V150 H75 Z']
            }
        ],
        viewBox: '0 0 300 150'
    },

    // ─── AUSTRALIA ────────────────────────────────────────────────────────
    {
        name: 'Australia',
        aspectRatio: 2/1,
        colorGroups: [
            {
                id: 'au-blue',
                label: 'Blue background',
                color: hexToHsb('#00008B'),
                isGuessable: true,
                paths: ['M0,0 H300 V150 H0 Z']
            },
            {
                id: 'au-red',
                label: 'Red Union Jack cross',
                color: hexToHsb('#CF142B'),
                isGuessable: true,
                paths: ['M0,0 H150 V75 A2,2 0 0,1 0,75 Z']
            },
            {
                id: 'au-white',
                label: 'White cross & stars',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: [
                    'M60,0 H90 V75 H60 Z',
                    'M0,30 H150 V45 H0 Z'
                ]
            }
        ],
        viewBox: '0 0 300 150'
    },

    // ─── SOUTH AFRICA ─────────────────────────────────────────────────────
    {
        name: 'South Africa',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'za-green',
                label: 'Green horizontal band',
                color: hexToHsb('#007A4D'),
                isGuessable: true,
                paths: ['M0,80 L80,100 L80,100 L0,120 Z', 'M80,90 H300 V110 H80 Z']
            },
            {
                id: 'za-red',
                label: 'Red top stripe',
                color: hexToHsb('#DE3831'),
                isGuessable: true,
                paths: ['M0,0 H300 V80 H0 Z']
            },
            {
                id: 'za-blue',
                label: 'Blue bottom stripe',
                color: hexToHsb('#002395'),
                isGuessable: true,
                paths: ['M0,120 H300 V200 H0 Z']
            },
            {
                id: 'za-yellow',
                label: 'Yellow outline',
                color: hexToHsb('#FFB81C'),
                isGuessable: false,
                paths: ['M0,75 L90,95 L90,105 L0,125 Z']
            },
            {
                id: 'za-black',
                label: 'Black triangle',
                color: hexToHsb('#000000'),
                isGuessable: false,
                paths: ['M0,0 L0,200 L75,100 Z']
            },
            {
                id: 'za-white',
                label: 'White triangle outline',
                color: hexToHsb('#FFFFFF'),
                isGuessable: false,
                paths: ['M0,0 L10,0 L82,100 L10,200 L0,200 Z']
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── BRAZIL ───────────────────────────────────────────────────────────
    {
        name: 'Brazil',
        aspectRatio: 10/7,
        colorGroups: [
            {
                id: 'br-green',
                label: 'Green background',
                color: hexToHsb('#009C3B'),
                isGuessable: true,
                paths: ['M0,0 H300 V210 H0 Z']
            },
            {
                id: 'br-yellow',
                label: 'Yellow diamond',
                color: hexToHsb('#FFDF00'),
                isGuessable: true,
                paths: ['M150,15 L285,105 L150,195 L15,105 Z']
            },
            {
                id: 'br-blue',
                label: 'Blue circle',
                color: hexToHsb('#002776'),
                isGuessable: true,
                paths: ['M150,105 m-50,0 a50,50 0 1,0 100,0 a50,50 0 1,0 -100,0']
            }
        ],
        viewBox: '0 0 300 210'
    },

    // ─── ARGENTINA ────────────────────────────────────────────────────────
    {
        name: 'Argentina',
        aspectRatio: 9/5.6,
        colorGroups: [
            {
                id: 'ar-blue',
                label: 'Light blue stripes',
                color: hexToHsb('#74ACDF'),
                isGuessable: true,
                paths: ['M0,0 H300 V56 H0 Z', 'M0,112 H300 V168 H0 Z']
            },
            {
                id: 'ar-white',
                label: 'White centre stripe',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M0,56 H300 V112 H0 Z']
            },
            {
                id: 'ar-yellow',
                label: 'Golden Sun',
                color: hexToHsb('#F6B40E'),
                isGuessable: true,
                paths: ['M150,84 m-22,0 a22,22 0 1,0 44,0 a22,22 0 1,0 -44,0']
            }
        ],
        viewBox: '0 0 300 168'
    },

    // ─── MEXICO ───────────────────────────────────────────────────────────
    {
        name: 'Mexico',
        aspectRatio: 7/4,
        colorGroups: [
            {
                id: 'mx-green',
                label: 'Green stripe',
                color: hexToHsb('#006847'),
                isGuessable: true,
                paths: ['M0,0 H75 V200 H0 Z']
            },
            {
                id: 'mx-white',
                label: 'White stripe',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M75,0 H225 V200 H75 Z']
            },
            {
                id: 'mx-red',
                label: 'Red stripe',
                color: hexToHsb('#CE1126'),
                isGuessable: true,
                paths: ['M225,0 H300 V200 H225 Z']
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── CHINA ────────────────────────────────────────────────────────────
    {
        name: 'China',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'cn-red',
                label: 'Red background',
                color: hexToHsb('#DE2910'),
                isGuessable: true,
                paths: ['M0,0 H300 V200 H0 Z']
            },
            {
                id: 'cn-yellow',
                label: 'Yellow stars',
                color: hexToHsb('#FFDE00'),
                isGuessable: true,
                paths: [
                    'M50,30 L55,45 L70,45 L58,54 L63,70 L50,60 L37,70 L42,54 L30,45 L45,45 Z',
                    'M90,15 L93,22 L100,22 L95,27 L97,35 L90,30 L83,35 L85,27 L80,22 L87,22 Z',
                    'M110,30 L113,37 L120,37 L115,42 L117,50 L110,45 L103,50 L105,42 L100,37 L107,37 Z',
                    'M110,55 L113,62 L120,62 L115,67 L117,75 L110,70 L103,75 L105,67 L100,62 L107,62 Z',
                    'M90,70 L93,77 L100,77 L95,82 L97,90 L90,85 L83,90 L85,82 L80,77 L87,77 Z'
                ]
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── INDIA ────────────────────────────────────────────────────────────
    {
        name: 'India',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'in-saffron',
                label: 'Saffron stripe',
                color: hexToHsb('#FF9933'),
                isGuessable: true,
                paths: ['M0,0 H300 V67 H0 Z']
            },
            {
                id: 'in-white',
                label: 'White stripe',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M0,67 H300 V133 H0 Z']
            },
            {
                id: 'in-green',
                label: 'Green stripe',
                color: hexToHsb('#138808'),
                isGuessable: true,
                paths: ['M0,133 H300 V200 H0 Z']
            },
            {
                id: 'in-navy',
                label: 'Navy Ashoka Chakra',
                color: hexToHsb('#000080'),
                isGuessable: false,
                paths: ['M150,100 m-20,0 a20,20 0 1,0 40,0 a20,20 0 1,0 -40,0']
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── KENYA ────────────────────────────────────────────────────────────
    {
        name: 'Kenya',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'ke-black',
                label: 'Black stripe',
                color: hexToHsb('#006600'),
                isGuessable: true,
                paths: ['M0,0 H300 V60 H0 Z', 'M0,95 H300 V105 H0 Z', 'M0,140 H300 V200 H0 Z']
            },
            {
                id: 'ke-red',
                label: 'Red stripe',
                color: hexToHsb('#BB0000'),
                isGuessable: true,
                paths: ['M0,55 H300 V100 H0 Z', 'M0,100 H300 V145 H0 Z']
            },
            {
                id: 'ke-green',
                label: 'Green stripes',
                color: hexToHsb('#006600'),
                isGuessable: false,
                paths: ['M0,0 H300 V55 H0 Z', 'M0,145 H300 V200 H0 Z']
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── NIGERIA ──────────────────────────────────────────────────────────
    {
        name: 'Nigeria',
        aspectRatio: 2/1,
        colorGroups: [
            {
                id: 'ng-green',
                label: 'Green stripes',
                color: hexToHsb('#008751'),
                isGuessable: true,
                paths: ['M0,0 H100 V150 H0 Z', 'M200,0 H300 V150 H200 Z']
            },
            {
                id: 'ng-white',
                label: 'White stripe',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: ['M100,0 H200 V150 H100 Z']
            }
        ],
        viewBox: '0 0 300 150'
    },

    // ─── USA ──────────────────────────────────────────────────────────────
    {
        name: 'United States',
        aspectRatio: 19/10,
        colorGroups: [
            {
                id: 'us-red',
                label: 'Red stripes',
                color: hexToHsb('#B22234'),
                isGuessable: true,
                paths: [
                    'M0,0 H380 V15 H0 Z',
                    'M0,30 H380 V45 H0 Z',
                    'M0,60 H380 V75 H0 Z',
                    'M0,90 H380 V105 H0 Z',
                    'M0,120 H380 V135 H0 Z',
                    'M0,150 H380 V165 H0 Z',
                    'M0,180 H380 V200 H0 Z'
                ]
            },
            {
                id: 'us-white',
                label: 'White stripes',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: [
                    'M0,15 H380 V30 H0 Z',
                    'M0,45 H380 V60 H0 Z',
                    'M0,75 H380 V90 H0 Z',
                    'M0,105 H380 V120 H0 Z',
                    'M0,135 H380 V150 H0 Z',
                    'M0,165 H380 V180 H0 Z'
                ]
            },
            {
                id: 'us-blue',
                label: 'Blue canton',
                color: hexToHsb('#3C3B6E'),
                isGuessable: true,
                paths: ['M0,0 H152 V105 H0 Z']
            }
        ],
        viewBox: '0 0 380 200'
    },

    // ─── TURKEY ───────────────────────────────────────────────────────────
    {
        name: 'Turkey',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'tr-red',
                label: 'Red background',
                color: hexToHsb('#E30A17'),
                isGuessable: true,
                paths: ['M0,0 H300 V200 H0 Z']
            },
            {
                id: 'tr-white',
                label: 'White crescent & star',
                color: hexToHsb('#FFFFFF'),
                isGuessable: true,
                paths: [
                    'M120,100 m-45,0 a45,45 0 1,0 90,0 a45,45 0 1,0 -90,0',
                    'M175,80 L178,90 L168,85 L178,85 L168,90 Z'
                ]
            }
        ],
        viewBox: '0 0 300 200'
    },

    // ─── THAILAND ─────────────────────────────────────────────────────────
    {
        name: 'Thailand',
        aspectRatio: 3/2,
        colorGroups: [
            {
                id: 'th-red',
                label: 'Red stripes',
                color: hexToHsb('#A51931'),
                isGuessable: true,
                paths: ['M0,0 H300 V40 H0 Z', 'M0,160 H300 V200 H0 Z']
            },
            {
                id: 'th-white',
                label: 'White stripes',
                color: hexToHsb('#F4F5F8'),
                isGuessable: true,
                paths: ['M0,40 H300 V80 H0 Z', 'M0,120 H300 V160 H0 Z']
            },
            {
                id: 'th-blue',
                label: 'Blue centre stripe',
                color: hexToHsb('#2D2A4A'),
                isGuessable: true,
                paths: ['M0,80 H300 V120 H0 Z']
            }
        ],
        viewBox: '0 0 300 200'
    }
];

// ─── EXPORTS ──────────────────────────────────────

module.exports = { FLAGS };
