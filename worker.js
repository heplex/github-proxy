export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // 处理根目录
    if (url.pathname === '/') {
      try {
        const indexResponse = await fetch('https://heplex.github.io/github-proxy/');
        const html = await indexResponse.text();
        return new Response(html, {
          headers: {
            'content-type': 'text/html;charset=UTF-8',
          },
        });
      } catch (error) {
        return new Response('Failed to load index page', { status: 500 });
      }
    }

    let targetURL = request.url;
    
    // 处理 releases/latest 的特殊情况
    if (url.pathname.includes('/releases/latest')) {
      const repoPath = url.pathname.split('/releases/latest')[0].slice(1);
      try {
        const apiResponse = await fetch(`https://api.github.com/repos/${repoPath}/releases/latest`, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'GitHub-Proxy'
          }
        });
        
        if (apiResponse.ok) {
          const releaseData = await apiResponse.json();
          return Response.redirect(`https://${url.host}/${repoPath}/releases/tag/${releaseData.tag_name}`, 302);
        }
      } catch (error) {
        console.error('Failed to fetch latest release:', error);
      }
    }
    
    // 处理 API 请求
    if (url.pathname.startsWith('/api/')) {
      const apiPath = url.pathname.replace('/api/', '');
      targetURL = `https://api.github.com/${apiPath}${url.search}`;
    } else {
      // GitHub 特殊链接处理规则
      const patterns = {
        '/raw/': (parts) => {
          const pathParts = url.pathname.split('/');
          const user = pathParts[1];
          const repo = pathParts[2];
          const branch = pathParts[4];
          const filePath = pathParts.slice(5).join('/');
          return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;
        },
        '/info/': (parts) => {
          return `https://github.com${url.pathname}${url.search}`;
        },
        '/git-upload-pack': (parts) => {
          return `https://github.com${url.pathname}${url.search}`;
        },
        '/releases/download/': (parts) => {
          const [_, user, repo, , , tag, ...filePath] = parts;
          return `https://github.com/${user}/${repo}/releases/download/${tag}/${filePath.join('/')}`;
        },
        '/media/': (parts) => {
          return `https://media.githubusercontent.com${url.pathname}`;
        },
        '/gist/': (parts) => {
          return `https://gist.githubusercontent.com${url.pathname.replace('/gist/', '/')}`;
        },
        '/archive/': (parts) => {
          return `https://codeload.github.com${url.pathname}`;
        },
        '/avatars/': (parts) => {
          return `https://avatars.githubusercontent.com${url.pathname}`;
        },
        '/blob/': (parts) => {
          const [_, user, repo, , branch, ...filePath] = parts;
          return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath.join('/')}`;
        }
      };

      if (!Object.keys(patterns).some(pattern => {
        if (url.pathname.includes(pattern)) {
          targetURL = patterns[pattern](url.pathname.split('/'));
          return true;
        }
        return false;
      })) {
        targetURL = `https://github.com${url.pathname}${url.search}`;
      }
    }

    try {
      const newHeaders = new Headers(request.headers);
      newHeaders.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
      newHeaders.set('User-Agent', 'GitHub-Proxy');
      
      const response = await fetch(targetURL, {
        method: request.method,
        headers: newHeaders,
        body: request.body
      });
      
      console.log(`Proxy request to ${targetURL}, status: ${response.status}`);
      
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      
      if (response.redirected) {
        const newUrl = new URL(response.url);
        console.log(`Redirecting to: ${newUrl.pathname}${newUrl.search}`);
        return Response.redirect(`https://${url.host}${newUrl.pathname}${newUrl.search}`, 302);
      }
      
      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
      });
    } catch (err) {
      console.error(`Proxy request failed: ${err.message}`, {
        targetURL,
        error: err
      });
      return new Response(`代理请求失败: ${err.message}`, { 
        status: 500,
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        }
      });
    }
  }
} 