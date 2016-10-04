// here will be content script of the plugin
/* eslint-disable one-var */
/* eslint-disable vars-on-top */

(function() {
  'use strict';
  var title, button, linksInProgress, indexCache;
  indexCache = {};

  setInterval(createCopyButton, 1000);
  setInterval(createHashLinks, 1000);

  function getTitle() {
    var taskNumber = document.querySelector('#key-val');
    var taskTitle = document.querySelector('#summary-val');
    var cleanedTitle;

    if (!taskNumber || !taskTitle) {
      return false;
    }
    
    cleanedTitle = taskTitle.innerText.replace(/\[P\]\s/g, '');
    return taskNumber.innerText + ': ' + cleanedTitle;
  }

  /**
   * @todo Research, how we could normally insert our group into the page
   */
  function createCopyButton() {
    var newTitle = getTitle();
    if (!newTitle) return;

    if (newTitle !== title) {
      title = newTitle;
      button = null;
    }

    if (button) return;


    var copyButton = document.createElement('a'),
      toolbarItem = document.createElement('li'),
      copiedItem = document.createElement('span'),
      toolbarGroup = document.createElement('ul'),
      lastToolbarGroup = document.getElementById('opsbar-opsbar-transitions');

    copyButton.href = 'javascript:void(0);';
    copyButton.title = 'Copy task title into the clipboard';
    copyButton.innerHTML = '<span class="icon copy-icon"></span><span class="trigger-text"> Copy Task Title</span>';
    copyButton.className = 'toolbar-trigger';

    toolbarItem.className = 'toolbar-item toolbar-item-copy';
    toolbarItem.appendChild(copyButton);

    copiedItem.innerText = 'copied';
    copiedItem.className = 'toolbar-item-copy-message';

    toolbarItem.appendChild(copiedItem);

    toolbarGroup.className = 'toolbar-group';
    toolbarGroup.appendChild(toolbarItem);

    copyButton.addEventListener('click', function() {
      copyToClipboard(function() {
        copiedItem.classList.add('toolbar-item-copy-message__visible');
        setTimeout(function() {
          copiedItem.classList.remove('toolbar-item-copy-message__visible');
        }, 450);
      });
    });

    // insert created toolbar after last one
    button = lastToolbarGroup.parentNode
      .insertBefore(toolbarGroup, lastToolbarGroup.nextSibling);
  }

  function copyToClipboard(callback) {
    chrome.extension.sendMessage({
      copy: title
    }, function(response) {
      if (response) {
        callback();
      }
    });
  }

  function getRevLinks() {
    const comms = document.querySelectorAll('.activity-comment')
    return Array.from(comms)
      .filter(comm => comm.querySelector('.action-details > a[rel="releaserobot"]'))
      .filter(comm => comm.querySelector('.action-body:not(.ja-updated)'))
      .map(comm => {
        const node = comm.querySelector('.action-body')
        const [, repo, rev] = node.innerText.match(/\s([\w\d-]+):(\d+)\sby\s/) || []
        return {
          node,
          repo,
          rev,
        }
      })
      .filter(comm => comm.repo && comm.rev)
  }

  function parse(txt) {
    return txt
      .split(`\n`)
      .reduce((acc, str) => {
        const data = str.split(' ')
        acc[data[0]] = data[1]
        return acc
      }, {})
  }

  function getHashLink(repo, rev) {
    const read = repo => `https://raw.githubusercontent.com/lj-team/migration-search-index/master/${repo}`
    const write = (repo, hash) => `<a href="http://gitlab.lj-19-m.local.bulyon.com/svn-history/${repo}/commit/${hash}" target="_blank">${hash}</a>`

    const rh = parse(localStorage.getItem(`lj-search-index--${repo}`) || '')
    if (rh.hasOwnProperty(rev)) return Promise.resolve(write(repo, rh[rev]))

    indexCache[repo] = indexCache[repo] || fetch(read(repo)).then(res => res.text())

    return indexCache[repo]
      .then(res => {
        const rh = parse(res)
      
        if (!rh.hasOwnProperty(rev)) {
          throw new Error('Didn\'t find hash. Try later.')
        }

        localStorage.setItem(`lj-search-index--${repo}`, res)
        return write(repo, rh[rev])
      })
      .catch(err => {
        return err.message
      })
  }

  function createHashLinks() {
    if (linksInProgress) return 

    const links = getRevLinks()
    if (!links || links.length === 0) return

    linksInProgress = true

    Promise.all(
      links
        .map(link => {
          return getHashLink(link.repo, link.rev)
            .then(res => {
              const prev = link.node.innerHTML
              link.node.innerHTML = `${prev}</br>${res}`
              link.node.className += ' ja-updated'
              return true
            })
        })
    )
      .then(() => {
        linksInProgress = false
      })
  }
}());
