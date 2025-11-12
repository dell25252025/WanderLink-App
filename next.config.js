
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your existing Next.js config here...

  webpack: (config, { isServer }) => {
    // Add an alias to always resolve algoliasearch to the lite version.
    config.resolve.alias['algoliasearch'] = 'algoliasearch/lite';
    
    return config;
  }
};

module.exports = nextConfig;
