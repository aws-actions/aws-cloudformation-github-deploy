module.exports = {
    // Prettier
    '**/*.{md}': ['prettier --ignore-path .gitignore --write'],
  
    // Eslint
    '**/*.{ts,tsx}': ['eslint --fix'],
  
    // Jest
    '**/*.test.{ml,mli,mly,ts,js,json}': 'jest',
  }
  