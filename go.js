var _ = require("lodash");
var Bluebird = require("bluebird");
var request = Bluebird.promisify(require("request"));
var fs = require("fs");
var toposort = require("toposort");

var purescriptRepos = "https://api.github.com/orgs/purescript/repos";
var purescriptForks = "https://api.github.com/orgs/purescript/repos?type=forks";
var purescriptContribRepos = "https://api.github.com/orgs/purescript-contrib/repos";
var purescriptContribForks = "https://api.github.com/orgs/purescript-contrib/repos?type=forks";

if (!fs.existsSync("cache")) {
  fs.mkdirSync("cache");
}

if (!fs.existsSync("cache/purescript")) {
  fs.mkdirSync("cache/purescript");
}

if (!fs.existsSync("cache/purescript-contrib")) {
  fs.mkdirSync("cache/purescript-contrib");
}

var headers = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "PureScript dependency graph builder"
};

var makeRequest = function (url) {
  return request({
    url: url,
    qs: {
      "access_token": fs.readFileSync("api_key.txt")
    },
    headers: headers,
    json: true
  });
};

var fetchRepos = function (url) {
  var result = [];

  var handleResponse = function (res, body) {
    result = result.concat(body);
    if (!res.headers.link) return result;
    var links = res.headers.link.split(",").map(function (link) {
      return link.split("; ");
    });
    var next = links.filter(function (link) {
      return link[1] == "rel=\"next\"";
    })[0];
    if (next) {
      next = next[0];
      var url = next.slice(1, next.length - 1);
      return request({ url: url, headers: headers, json: true })
        .spread(handleResponse);
    } else {
      return result;
    }
  };
  return makeRequest(url).spread(handleResponse);
};

var p;

if (!fs.existsSync("cache/index.json")) {
  p = Bluebird.all([purescriptRepos, purescriptForks, purescriptContribRepos, purescriptContribForks].map(fetchRepos))
    .then(function (ress) {
      var repos = _.flatten(ress);
      fs.writeFileSync("cache/index.json", JSON.stringify(repos, null, 4));
      return repos;
    });
} else {
  p = Bluebird.try(function() {
    return JSON.parse(fs.readFileSync("cache/index.json"));
  });
}

var excludes = ["purescript/purescript-in-purescript"];

var findDependencies = function (initial, edges) {
  var pending = [initial];
  var done = [];
  var result = [];
  while (pending.length > 0) {
    var item = pending.pop();
    done.push(item);
    edges.forEach(function(edge) {
      if (edge.to === item) {
        if (result.indexOf(edge.from) === -1) {
          result.push(edge.from);
          pending.push(edge.from);
        }
      }
    });
  }
  return result;
};

p.then(function (json) {
  var repos = _.map(json, "full_name").filter(function (item) {
    return item != null && excludes.indexOf(item) === -1 && item.split("/").pop().indexOf("purescript-") === 0;
  });
  return Bluebird.all(repos.map(function (name) {
    var shortName = name.split("/").pop();
    if (fs.existsSync("cache/" + name + ".json")) {
      return { name: shortName, json: JSON.parse(fs.readFileSync("cache/" + name + ".json")) };
    }
    return request("https://raw.github.com/" + name + "/master/bower.json", { json: true })
      .spread(function (res, body) {
        console.log("Downloaded " + name + " bower file");
        fs.writeFileSync("cache/" + name + ".json", JSON.stringify(body, null, 4));
        console.log("Wrote cache/" + name + ".json");
        return { name: shortName, json: res.body };
      });
  }));
})
.then(function (bowerFiles) {
  var edges = _.flatten(bowerFiles.map(function (bf) {
    var name = bf.name;
    var deps = bf.json.dependencies || {};
    var devDeps = bf.json.devDependencies || {};
    return Object.keys(deps).map(function (k) {
      return { from: bf.name, to: k };
    }).concat(Object.keys(devDeps).map(function (k) {
      return { from: bf.name, to: k };
    }));
  }));
  fs.writeFileSync("graph.json", JSON.stringify(edges, null, 4));
  if (process.argv[2]) {
    var reverseEdges = edges.map(function (edge) {
      return { from: edge.to, to: edge.from };
    });
    var deps = findDependencies(process.argv[2], edges);
    deps.sort();
    var xs = _.flatten(deps.map(function (dep) {
      var related = _.unique(edges.filter(function (edge) {
        return edge.from === dep;
      }).map(function (edge) {
        return edge.to;
      }).filter(function (related) {
        return deps.indexOf(related) != -1;
      }));
      return related.map(function (rel) {
        return [rel, dep];
      });
    }), true);
    console.log(toposort(xs).join("\n"));
  }
})
.catch(function (err) {
  console.error("Error:", err.stack);
});
