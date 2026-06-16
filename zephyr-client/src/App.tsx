import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material'
import Home from './pages/Home'
import Monitor from './pages/Monitor'

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
})

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppBar position="static" sx={{ background: '#1a1a2e' }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', color: '#4fc08d' }}>
            Zephyr
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button color="inherit" href="/">
              首页
            </Button>
            <Button color="inherit" href="/monitor">
              监控
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      {children}
    </>
  )
}

function Root() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/monitor" element={<Monitor />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default Root
