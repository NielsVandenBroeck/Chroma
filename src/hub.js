document.getElementById('btn-chroma').addEventListener('click', () => {
    // Preserve the query params so the SDK on the next page has the frame_id
    window.location.href = '/chroma.html' + window.location.search;
});

document.getElementById('btn-flagle').addEventListener('click', () => {
    window.location.href = '/flagle.html' + window.location.search;
});