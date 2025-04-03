# MIAL Project

## Overview
MIAL (My Awesome AI Library) is a project designed to provide tools and utilities for building AI-powered applications.

## Features
- Easy-to-use APIs
- Modular and extensible design
- Support for various AI models

## Getting Started
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/mial.git
   ```
2. Navigate to the project directory:
   ```bash
   cd mial
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Without `tlds.js`
You can use the package by providing your own list of domains and TLDs:
```javascript
const { Mial } = require('./mial');

const config = {
    domains: ['gmail.com', 'yahoo.com', 'outlook.com'],
    tlds: ['com', 'org', 'net']
};

const mial = new Mial(config);

console.log(mial.recommend('user@gmil.com')); // Suggests 'user@gmail.com'
console.log(mial.isInvalid('user@unknown.xyz')); // Returns true
```

### With `tlds.js`
If you want to use the pre-defined list of TLDs from `tlds.js`:
```javascript
const { Mial } = require('./mial');
const { tlds } = require('./tlds');

const config = {
    domains: ['gmail.com', 'yahoo.com', 'outlook.com'],
    tlds: tlds
};

const mial = new Mial(config);

console.log(mial.recommend('user@gmil.com')); // Suggests 'user@gmail.com'
console.log(mial.isInvalid('user@unknown.xyz')); // Returns true
```

## Contributing
Contributions are welcome! Please open an issue or submit a pull request.

## License
This project is licensed under the MIT License.
