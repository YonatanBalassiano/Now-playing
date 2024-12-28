const express = require('express');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
const port = process.env.PORT || 8888;

app.use(cors());

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.CALLBACK_URI,
    // scopes : ['user-read-currently-playing','user-read-playback-state']
});
// Login endpoint
app.get('/login', (req, res) => {
    const scopes = ['user-read-currently-playing', 'user-read-playback-state'];
    const authorizeURL = spotifyApi.createAuthorizeURL(scopes);
    res.redirect(authorizeURL);
});

// Callback endpoint
app.get('/callback', async (req, res) => {
    const { code } = req.query;

    try {
        const data = await spotifyApi.authorizationCodeGrant(code);

        spotifyApi.setAccessToken(data.body['access_token']);
        spotifyApi.setRefreshToken(data.body['refresh_token']);

        console.log('Access Token:', data.body['access_token']);
        console.log('Refresh Token:', data.body['refresh_token']);

        res.redirect('http://localhost:8888/now-playing');
    } catch (err) {
        console.error('Error getting tokens:', err);
        res.send('Error getting tokens');
    }
});

// Refresh token function
async function refreshAccessToken() {
    try {
        const data = await spotifyApi.refreshAccessToken();
        spotifyApi.setAccessToken(data.body['access_token']);
        console.log('Access token refreshed');
        return true;
    } catch (err) {
        console.error('Error refreshing access token:', err);
        return false;
    }
}

// Get artist details function
async function getArtistDetails(artistId) {
    try {
        const artistData = await spotifyApi.getArtist(artistId);
        console.log('Artist details:', artistData.body.images);
        return {
            name: artistData.body.name,
            images: artistData.body.images,
            followers: artistData.body.followers.total,
            genres: artistData.body.genres,
            spotifyUrl: artistData.body.external_urls.spotify
        };
    } catch (err) {
        console.error('Error fetching artist details:', err);
        return null;
    }
}

// New endpoint to get artist details
app.get('/artist/:id', async (req, res) => {
    try {
        const artistDetails = await getArtistDetails(req.params.id);
        if (artistDetails) {
            console.log('Artist details:', artistDetails);
            res.json(artistDetails);
        } else {
            res.status(404).json({ error: 'Artist not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch artist details' });
    }
});

app.get('/current-device-play', async (req, res) => {
  try {
    const data = await spotifyApi.getMyCurrentPlaybackState();
    console.log('Current device play:', data.body);
    res.json(data.body);
  }
    catch (err) {
        console.error('Error getting current device play:', err);
        res.status(500).json({ error: 'Failed to fetch current device play' });
    }
});

app.get('/now-playing', async (req, res) => {
    try {
        const data = await spotifyApi.getMyCurrentPlayingTrack();

        if (data.body && data.body.item) {
            const track = data.body.item;
            const artist = track.artists[0];

            // Get additional artist details
            const artistDetails = await getArtistDetails(artist.id);

            res.json({
                isPlaying: data.body.is_playing,
                trackName: track.name,
                artist: {
                    name: artist.name,
                    id: artist.id,
                    spotifyUrl: artist.external_urls.spotify,
                    images: artistDetails ? artistDetails.images : [], // Artist photos in different sizes
                    followers: artistDetails ? artistDetails.followers : 0,
                    genres: artistDetails ? artistDetails.genres : []
                },
                album: {
                    name: track.album.name,
                    images: track.album.images, // Album artwork in different sizes
                    spotifyUrl: track.album.external_urls.spotify
                },
                trackUrl: track.external_urls.spotify,
                duration: track.duration_ms,
                progressMs: data.body.progress_ms
            });
        } else {
            res.json({
                isPlaying: false,
                message: 'No track currently playing'
            });
        }
    } catch (err) {
        // If token expired, try refreshing it
        if (err.statusCode === 401) {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                try {
                    const data = await spotifyApi.getMyCurrentPlayingTrack();
                    if (data.body && data.body.item) {
                        const track = data.body.item;
                        const artist = track.artists[0];
                        const artistDetails = await getArtistDetails(artist.id);

                        return res.json({
                            isPlaying: data.body.is_playing,
                            trackName: track.name,
                            artist: {
                                name: artist.name,
                                id: artist.id,
                                spotifyUrl: artist.external_urls.spotify,
                                images: artistDetails ? artistDetails.images : [],
                                followers: artistDetails ? artistDetails.followers : 0,
                                genres: artistDetails ? artistDetails.genres : []
                            },
                            album: {
                                name: track.album.name,
                                images: track.album.images,
                                spotifyUrl: track.album.external_urls.spotify
                            },
                            trackUrl: track.external_urls.spotify,
                            duration: track.duration_ms,
                            progressMs: data.body.progress_ms
                        });
                    }
                } catch (refreshError) {
                    console.error('Error after token refresh:', refreshError);
                }
            }
        }
        res.status(401).json({
            error: 'Authentication required',
            message: 'Please visit /login first'
        });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log('Please visit http://localhost:8888/login to authenticate');
});
